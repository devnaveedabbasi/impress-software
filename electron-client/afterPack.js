const fs = require('fs');
const path = require('path');

exports.default = async (context) => {
  const frontendDir = path.join(context.appOutDir, 'resources', 'frontend');
  const invDir = path.resolve(__dirname, '..', 'impress-inv');

  // 1. Copy node_modules from standalone if needed
  const nodeModulesSrc = path.join(invDir, '.next', 'standalone', 'node_modules');
  const nodeModulesDst = path.join(frontendDir, 'node_modules');
  if (fs.existsSync(nodeModulesSrc)) {
    fs.cpSync(nodeModulesSrc, nodeModulesDst, { recursive: true, dereference: true });
    console.log('node_modules copied to', nodeModulesDst);
  }

  // 2. Copy .next/static to resources/frontend/.next/static (REQUIRED by Next.js standalone)
  const staticSrc = path.join(invDir, '.next', 'static');
  const staticDst = path.join(frontendDir, '.next', 'static');
  if (fs.existsSync(staticSrc)) {
    fs.cpSync(staticSrc, staticDst, { recursive: true, dereference: true });
    console.log('static files copied to', staticDst);
  }

  // 3. Copy public to resources/frontend/public (REQUIRED by Next.js standalone)
  const publicSrc = path.join(invDir, 'public');
  const publicDst = path.join(frontendDir, 'public');
  if (fs.existsSync(publicSrc)) {
    fs.cpSync(publicSrc, publicDst, { recursive: true, dereference: true });
    console.log('public files copied to', publicDst);
  }
};