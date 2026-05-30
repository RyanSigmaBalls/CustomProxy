const app = require('./src/app');
const dotenv = require('dotenv');
const http = require('http');

dotenv.config();

const PORT = process.env.PORT || 4000;

const server = http.createServer(app);

// Attach websocket upgrade handling for the reverse proxy
try{
  const serviceProxy = require('./src/middleware/reverseProxy');
  if(serviceProxy && typeof serviceProxy.attachUpgrade === 'function'){
    serviceProxy.attachUpgrade(server);
  }
}catch(e){ console.warn('Could not attach websocket proxy:', e); }

server.listen(PORT, () => {
  console.log(`CustomProxy running on http://localhost:${PORT}`);
});
