const fs = require('fs');
const path = require('path');
const dir = 'd:/NaveedAbbasi/TRB/impress/impress-inv/src/app/(pages)/master-entries';

const files = fs.readdirSync(dir);
for (const file of files) {
  const fullPath = path.join(dir, file, 'page.tsx');
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, 'utf8');
    
    // Find block
    const targetBlock = 'if (debouncedId === String(nextId)) {\n            setIsNewMode(true);\n            setIsEditing(true);\n            return;\n        }';
    const replaceBlock = 'if (debouncedId === String(nextId)) {\n            setValues({ ...initialValues, id: nextId });\n            setIsNewMode(true);\n            setIsEditing(true);\n            return;\n        }';
    
    if (content.includes(targetBlock)) {
        content = content.replace(targetBlock, replaceBlock);
    } else {
        // sometimes formatting differs, let's try a regex
        const targetRegex = /if\s*\(debouncedId\s*===\s*String\(nextId\)\)\s*\{\s*setIsNewMode\(true\);\s*setIsEditing\(true\);\s*return;\s*\}/;
        if (targetRegex.test(content)) {
            content = content.replace(targetRegex, 'if (debouncedId === String(nextId)) {\n            setValues({ ...initialValues, id: nextId });\n            setIsNewMode(true);\n            setIsEditing(true);\n            return;\n        }');
        }
    }

    // Replace old setValues with hardcoded fields to generic initialValues
    // like setValues({ ...values, id: nextId, name: "", provinceId: "" });
    content = content.replace(/setValues\(\{\s*\.\.\.values,\s*id:\s*nextId[^\}]*\}\);/g, 'setValues({ ...initialValues, id: nextId });');
    
    // Sometimes it's setValues({ ...values, id: nextId, name: "" }); etc
    // The regex /setValues\(\{\s*\.\.\.values,\s*id:\s*nextId[^\}]*\}\);/ covers it.

    fs.writeFileSync(fullPath, content, 'utf8');
    console.log('Fixed', fullPath);
  }
}
