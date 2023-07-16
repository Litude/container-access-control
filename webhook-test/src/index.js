import https from 'https';
import { readFileSync } from "fs"
import { deepClone, compare } from 'fast-json-patch/index.mjs';
import express from "express";

const HTTPS_PORT = 3080;
const SECRET_DIR = process.env.SECRET_DIR || 'certs'

const app = express()

const customInitContainer = Object.freeze({
    name: "iptables-initer",
    image: process.env.WEBHOOK_INIT_CONTAINER || "tomras/istio-iptables-clone",
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

// app.listen(3000, () => {
//     console.log('Server running, http on 3000 and https on 3080')
// })

https
    .createServer({
        key: readFileSync(`${SECRET_DIR}/tls.key`),
        cert: readFileSync(`${SECRET_DIR}/tls.crt`),
        passphrase: '',
    }, app)
    .listen(HTTPS_PORT, () => {
        console.log(`Listening for HTTPS on port ${HTTPS_PORT}`)
})


app.get('/', (req, res) => {
    res.send('Hello world!')
})

app.post('/validate-pods', (req, res) => {
    //console.log(req.body)
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
})

app.post('/mutate-pods', (req, res) => {
    try {
        //console.log(req.body)
        const originalObject = req.body.request.object
        const istioInitialized = originalObject.spec.initContainers && originalObject.spec.initContainers.some(container => container.name === "istio-init")
        console.log(`Istio has been initialized: ${istioInitialized}`)
        // Only inject if this label exists, can be automatically added to all pods in namespace with the command:
        // kubectl label namespace <namespace_name|default> webhook-iptables=enabled --overwrite
        // Which is how istio does it
        console.log(JSON.stringify(req.body))
        const injectionEnabled = originalObject.metadata.labels['webhook-iptables'] === 'enabled'
        console.log(`Status of injection: ${injectionEnabled}`)

        if (istioInitialized && injectionEnabled) {
            const modifiedObject = deepClone(originalObject)
            modifiedObject.spec.initContainers = [customInitContainer]
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
            //console.log(JSON.stringify(originalObject.spec))
            // const modifiedObject = deepClone(originalObject)
        
            // modifiedObject.metadata.labels['stuff'] = 'test'
        
            // const patches = compare(originalObject, modifiedObject)
            // console.log('Applying patch:')
            // console.log(patches)
    
            // const encodedPatch = Buffer.from(JSON.stringify(patches)).toString("base64")
            // console.log(`Returning patch: ${encodedPatch}`)
            return res.json(
                {
                    apiVersion: "admission.k8s.io/v1",
                    kind: "AdmissionReview",
                    response: {
                        uid: req.body.request.uid, 
                        allowed: true,
                        // patchType: "JSONPatch",
                        // patch: encodedPatch
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
