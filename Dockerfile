# 运行包里已经构建好的界面与服务，镜像里不用 npm install。
# 改过源码：先在本机 npm ci && npm run build，再构建镜像。
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
# server/ 直接运行 .ts（Node 自带的类型擦除），它引用 src/ 里两个无依赖的协议文件；src/ 整个带上，以后多引用也不会漏。
COPY package.json ./
COPY server ./server
COPY src ./src
COPY dist ./dist
COPY director/dist ./director/dist
USER node
EXPOSE 3000
CMD ["node", "server/index.ts"]
