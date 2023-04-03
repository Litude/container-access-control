import http from 'http'
import pg from 'pg'
const { Client } = pg;

const hostname = '0.0.0.0';
const port = 3001;

const server = http.createServer(async (req, res) => {
  // res.statusCode = 200;
  // res.setHeader('Content-Type', 'application/json');
  // res.end(JSON.stringify({ message: 'Hello from App2!' }));
  const client = new Client({
    host: process.env.DB_HOST,
    database: 'testdb'
  })
  try {
    await client.connect()
    const dbRes = await client.query(`SELECT * FROM test_table`)
    console.log(dbRes)
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(dbRes.rows));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain');
    res.end(`Error: ${error.message}`);
  } finally {
    await client.end();
  }

});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
