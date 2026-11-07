const logger = (req, res, next) => {
  const startedAt = Date.now();
  console.log(`[HTTP] ${req.method} ${req.originalUrl} - ${new Date().toLocaleTimeString()}`);

  res.on("finish", () => {
    console.log(
      `[HTTP] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - startedAt}ms)`
    );
  });

  next();
};

export default logger;