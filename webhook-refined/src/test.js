import { promises as dns } from "dns"

const testString = "-I INPUT p tcp -s dns:www.goweggewscogfwefle.com --dport 4000 -d dns:www.is.fi -j ACCEPT"

const serviceMatcher = new RegExp(" dns:(.*?) ");
let inputString = testString
let matches = inputString.match(serviceMatcher)

console.log(matches)
while (matches && matches.length > 1) {
    const domain = matches[1]
    const { address } = await dns.lookup(domain)
    inputString = inputString.replace(`dns:${domain}`, address)
    matches = inputString.match(serviceMatcher)
    console.log(inputString)
}
