import https from 'https';
import { readFileSync } from "fs"
import express from "express";

const HTTPS_PORT = 3080;
const SECRET_DIR = process.env.SECRET_DIR || 'certs'

const app = express()

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
    console.log(req.body)
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