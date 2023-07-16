import https from 'https';
import { readFileSync } from "fs"
import { deepClone, compare } from 'fast-json-patch/index.mjs';
import { promises as dns } from "dns"
import express from "express";

const HTTPS_PORT = 3080;
const SECRET_DIR = process.env.SECRET_DIR || 'certs'
const CONTAINER_NAME = "iptables-initer"
const ISTIO_PROXY_IP = "127.0.0.6"
const ISTIO_PROXY_KEY = "istio-proxy"

const app = express()

// Drop all inbound and outbound connections by default but allow established
const DEFAULT_RULES = [
    "-P INPUT DROP",
    "-P FORWARD DROP",
    "-P OUTPUT DROP",
    "-A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT",
    "-A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT",
    "-A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT",
]

const ISTIO_RULES = [
    // INPUT RULES
    "-I INPUT -p tcp --dport 15000 -j ACCEPT", // envoy admin port (required for istio to enter ready state)
    "-I INPUT -p tcp --dport 15001 -j ACCEPT", // envoy outbound
    "-I INPUT -p tcp --dport 15006 -j ACCEPT", // requests passing through the proxy are redirected to 15006
    "-I INPUT -p tcp --dport 15020 -j ACCEPT", // envoy proxy health checks
    "-I INPUT -p tcp --dport 15021 -j ACCEPT", // envoy proxy health checks

    // OUTPUT RULES
    "-I OUTPUT -p tcp --dport 15000 -j ACCEPT", // envoy admin port (also required for envoy to work...ex)
    "-I OUTPUT -p tcp --dport 15001 -j ACCEPT", // envoy outbound
    "-I OUTPUT -p tcp --dport 15012 -j ACCEPT", // retrieving certificate
    "-I OUTPUT -p tcp --dport 15020 -j ACCEPT", // health check for control plane?
    "-I OUTPUT -p udp -m udp --dport 53 -j ACCEPT", // performing DNS queries, should this be enabled by default?
]

const CONTAINER_TEMPLATE = Object.freeze({
    name: CONTAINER_NAME,
    image: process.env.WEBHOOK_INIT_CONTAINER || "tomras/iptables-runner",
    command: ["/bin/bash", "-c"],
    args: [],
    securityContext: {
        capabilities: {
          add: [
            "NET_ADMIN",
            "NET_RAW"
          ],
          drop: [
            "ALL"
          ]
        },
        privileged: true,
        runAsUser: 0,
        runAsGroup: 0,
        runAsNonRoot: false,
        readOnlyRootFilesystem: false,
        allowPrivilegeEscalation: true
      }
})

app.use(express.json());

https
    .createServer({
        key: readFileSync(`${SECRET_DIR}/tls.key`),
        cert: readFileSync(`${SECRET_DIR}/tls.crt`),
        passphrase: '',
    }, app)
    .listen(HTTPS_PORT, () => {
        console.log(`Listening for HTTPS on port ${HTTPS_PORT}`)
})

const parseDnsNames = async (inputString) => {
    const serviceMatcher = new RegExp(" dns:(.*?) ");
    let currentString = inputString
    let matches = currentString.match(serviceMatcher)
    while (matches && matches.length > 1) {
        const domain = matches[1]
        const { address } = await dns.lookup(domain)
        currentString = currentString.replace(`dns:${domain}`, address)
        matches = currentString.match(serviceMatcher)
    }
    console.log(currentString)
    return currentString
}

const createInitContainer = async (customRules, istioInitialized) => {
    const initContainer = { ...CONTAINER_TEMPLATE }
    let rules = [...DEFAULT_RULES]
    if (istioInitialized) {
        rules.push(...ISTIO_RULES)
    }
    rules.push(...customRules.split(";").map(x => x.trim()).filter(x => x.startsWith('-')))
    const parsedRules = rules.map(rule => `iptables ${rule}`).join(';').replaceAll(ISTIO_PROXY_KEY, ISTIO_PROXY_IP)
    initContainer.args = [await parseDnsNames(parsedRules)];
    return initContainer
}

const isModificationRequired = (injectionEnabled, currentObject) => {
    if (!injectionEnabled) {
        return false;
    }
    if (!currentObject.spec.initContainers || !currentObject.spec.initContainers.length) {
        return true;
    }
    const currentIndex = currentObject.spec.initContainers.findIndex(container => container.name === CONTAINER_NAME)
    if (currentIndex === -1) {
        return true;
    }
    if (currentObject.spec.initContainers?.length !== undefined && currentIndex !== currentObject.spec.initContainers?.length - 1) {
        return true;
    }
    return false;
}

const addInitContainerToObject = (originalObject, initContainer) => {
    const modifiedObject = deepClone(originalObject)
    if (!modifiedObject.spec.initContainers) {
        modifiedObject.spec.initContainers = [initContainer]
    }
    else if (!modifiedObject.spec.initContainers.length) {
        modifiedObject.spec.initContainers.push(initContainer)
    }
    // Exists but not last, need to change index...
    else {
        const currentIndex = modifiedObject.spec.initContainers.findIndex(container => container.name === CONTAINER_NAME)
        modifiedObject.spec.initContainers.splice(currentIndex, 1)
        modifiedObject.spec.initContainers.push(initContainer)
    }
    return modifiedObject
}


app.get('/', (req, res) => {
    res.send('Hello world!')
})

app.post('/mutate-pods', async (req, res) => {
    try {
        //console.log(req.body)
        const originalObject = req.body.request.object
        const injectionEnabled = !!originalObject.metadata?.annotations?.['iptables']

        const shouldModify = isModificationRequired(injectionEnabled, originalObject)

        // This is actually not very interesting... Let istio init its NAT changes and we init our rules separately
        const istioInitialized = originalObject.spec.initContainers && originalObject.spec.initContainers.some(container => container.name === "istio-init")
        // console.log(`Istio has been initialized: ${istioInitialized}`)

        console.log(`Status of injection: ${shouldModify}`)

        if (shouldModify) {
            //const modifiedObject = deepClone(originalObject)
            const customRules = originalObject.metadata?.annotations?.['iptables']
            const initContainer = await createInitContainer(customRules, istioInitialized)
            const modifiedObject = addInitContainerToObject(originalObject, initContainer)
            const patches = compare(originalObject, modifiedObject)
            console.log('Applying patch:')
            console.log(patches)
    
            const encodedPatch = Buffer.from(JSON.stringify(patches)).toString("base64")
            console.log(`Returning patch: ${encodedPatch}`)
            return res.json(
                {
                    apiVersion: "admission.k8s.io/v1",
                    kind: "AdmissionReview",
                    response: {
                        uid: req.body.request.uid, 
                        allowed: true,
                        patchType: "JSONPatch",
                        patch: encodedPatch
                    }
                }
            )
        }
        else {
            return res.json(
                {
                    apiVersion: "admission.k8s.io/v1",
                    kind: "AdmissionReview",
                    response: {
                        uid: req.body.request.uid, 
                        allowed: true,
                    }
                }
            )
        }
    } catch (error) {
        console.log(`Got error ${error.message}`)
        console.log(error.stack)
        return res.json(
            {
                apiVersion: "admission.k8s.io/v1",
                kind: "AdmissionReview",
                response: {
                    uid: req.body.request.uid, 
                    allowed: true,
                }
            }
        )
    }
})
