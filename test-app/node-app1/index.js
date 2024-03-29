import http from 'http'

const hostname = '0.0.0.0';
const serviceUrl = process.env.APP2_SERVICE
const port = 3000;

const server = http.createServer(async (req, res) => {
  try {
    const hasQuery = !!req.url.split('?')[1]
    if (hasQuery) {
      const data = await fetch(`http://localhost:5000`)
      if (!data.ok) {
        throw new Error(await data.text())
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain');
      res.end(await data.text());
    }
    else {
      const data = await fetch(`http://localhost:4000`)
      if (!data.ok) {
        throw new Error(await data.text())
      }
      const response = await data.text();
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain');
      res.end(response);
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
