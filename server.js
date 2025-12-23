const http = require("http");

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain");
  res.end("hello world from law-gpt9 build ok");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("server running on port " + PORT);
});
