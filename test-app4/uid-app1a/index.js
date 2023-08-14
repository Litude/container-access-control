import http from 'http'

const hostname = '0.0.0.0';
const port = 3000;

const server = http.createServer(async (req, res) => {
  try {
    const hasQuery = !!req.url.split('?')[1]
    if (hasQuery) {
      const query = req.url.split('?')[1]
      if (query === 'container2') {
        const data = await fetch(`http://localhost:4000`)
        if (!data.ok) {
          throw new Error(await data.text())
        }
        const response = await data.text();
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain');
        res.end(`Received response from container 2:\n ${response}`);
        return;
      }
      else if (query === 'container3') {
        const data = await fetch(`http://localhost:5000`)
        if (!data.ok) {
          throw new Error(await data.text())
        }
        const response = await data.text();
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain');
        res.end(`Received response from container 3:\n ${response}`);
        return;
      }
      else if (query === 'service') {
        const data = await fetch(`http://uid-app2-service:5000`)
        if (!data.ok) {
          throw new Error(await data.text())
        }
        const response = await data.text();
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain');
        res.end(`Received response from service:\n ${response}`);
        return;
      }
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Hello from container 1');

  } catch (error) {
    console.log(error.message)
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain')
    res.end(`Error: ${error.message}`)
  }
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
