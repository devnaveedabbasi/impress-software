const fs = require('fs');
const path = 'd:/NaveedAbbasi/TRB/impress/impress-inv/src/app/(pages)/master-entries/inventory/page.tsx';
let content = fs.readFileSync(path, 'utf8');

const regex = /catch\s*\(error\)\s*\{\s*console\.error\("Failed to fetch dropdown options",\s*error\);\s*\}/;

if (regex.test(content)) {
    content = content.replace(regex, `catch (error) {
            console.error("Failed to fetch dropdown options", error);
        } finally {
            setIsOptionsLoading(false);
        }`);
    fs.writeFileSync(path, content, 'utf8');
    console.log('Fixed fetchOptions');
} else {
    console.log('Could not find fetchOptions catch block');
}
