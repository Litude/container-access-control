#tomras/iptables-lo-webhook
FROM node:18

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3080

CMD [ "node", "index.js" ]
