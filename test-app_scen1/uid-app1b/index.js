import http from 'http'

const hostname = '127.0.0.1';
const port = 4000;

const server = http.createServer(async (req, res) => {
  try {
    const hasQuery = !!req.url.split('?')[1]
    if (hasQuery) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain');
      res.end('Hello from container 2');
    }
    else {
      const data = await fetch(`http://localhost:5000`)
      if (!data.ok) {
        throw new Error(await data.text())
      }
      const response = await data.text();
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain');
      res.end(`Forwarded message from container 3: ${response}`);
    }

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
