import https from 'https';
import { readFileSync } from "fs"
import { deepClone, compare } from 'fast-json-patch/index.mjs';
import express from "express";

const HTTPS_PORT = 3080;
const SECRET_DIR = process.env.SECRET_DIR || 'certs'
const CONTAINER_NAME = "iptables-initer"

const app = express()

// Drop all inbound and outbound connections by default but allow established
const DEFAULT_RULES = [
    "-A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT",
    "-A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT",
    "-A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT",
    // If logging is needed
    // "-A INPUT -i lo -m limit --limit 5/min -j LOG --log-prefix 'IPTABLES INPUT DROPPED:'",
    // "-A OUTPUT -o lo -m limit --limit 5/min -j LOG --log-prefix 'IPTABLES OUTPUT DROPPED:'",
    "-A INPUT -i lo -j DROP",
    "-A FORWARD -i lo -j DROP",
    "-A OUTPUT -o lo -j DROP",
]

const ISTIO_RULES = [
    // // INPUT RULES
    "-I INPUT -i lo -p tcp --dport 15000 -j ACCEPT", // envoy admin port (required for istio to enter ready state)
    "-I INPUT -i lo -p tcp --dport 15001 -j ACCEPT", // envoy outbound (required for services)
    "-I INPUT -i lo -p tcp --dport 15020 -j ACCEPT", // envoy proxy health checks
    "-I INPUT -i lo -p tcp --dport 15021 -j ACCEPT", // envoy proxy health checks

    // // OUTPUT RULES
    "-I OUTPUT -o lo -p tcp --dport 15000 -j ACCEPT", // envoy admin port (also required for envoy to work...ex)
    "-I OUTPUT -o lo -p tcp --dport 15020 -j ACCEPT", // health check for control plane?
    "-I OUTPUT -o lo -p udp -m udp --dport 53 -j ACCEPT", // performing DNS queries, should this be enabled by default?
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

const createInitContainer = async (customRules, istioInitialized) => {
    const cleanedRules = customRules.split(";").map(x => x.trim())
    const strict = customRules.includes("STRICT");
    const initContainer = { ...CONTAINER_TEMPLATE }
    const rules = ["-F"] // flush all rules
    rules.push(...cleanedRules.filter(x => x.startsWith('-')))
    // Add strict rules last so custom rules take precedence
    if (strict) {
        rules.push(...DEFAULT_RULES)
        if (istioInitialized) {
            rules.push(...ISTIO_RULES)
        }
    }
    initContainer.args = [rules.map(rule => `iptables ${rule}`).join(';')]
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

app.post('/iptables-apply', async (req, res) => {
    try {
        const originalObject = req.body.request.object
        const injectionEnabled = !!originalObject.metadata?.annotations?.['iptables']

        const shouldModify = isModificationRequired(injectionEnabled, originalObject)

        // Detect Istio so required ports can be opened automatically. Let istio init its NAT changes and we init our rules separately
        const istioInitialized = originalObject.spec.initContainers && originalObject.spec.initContainers.some(container => container.name === "istio-init")

        console.log(`Status of injection: ${shouldModify}`)

        if (shouldModify) {
            const customRules = originalObject.metadata?.annotations?.['iptables']
            const initContainer = await createInitContainer(customRules, istioInitialized)
            const modifiedObject = addInitContainerToObject(originalObject, initContainer)
            const patches = compare(originalObject, modifiedObject)
            console.log('Applying patch:')
            console.log(patches)
    
            const encodedPatch = Buffer.from(JSON.stringify(patches)).toString("base64")
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
