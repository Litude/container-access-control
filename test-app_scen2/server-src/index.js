import http from 'http'

const hostname = process.env.SERVER_HOSTNAME || 'localhost';
const port = process.env.SERVER_PORT || 3000;

const server = http.createServer(async (req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain')
    res.end(`Hello from ${hostname}:${port}`)
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
