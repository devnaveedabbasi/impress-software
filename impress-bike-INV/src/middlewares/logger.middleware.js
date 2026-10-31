const logger = (req, res, next) => {
  console.log(`${req.method} ${req.originalUrl} - ${new Date().toLocaleTimeString()}`);

  next();
};

export default logger;