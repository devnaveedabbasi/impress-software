const fs = require('fs');

const pagePath = 'd:/NaveedAbbasi/TRB/impress/impress-inv/src/app/(pages)/store/rejection-return-to-vendor/page.tsx';
let pageContent = fs.readFileSync(pagePath, 'utf8');

// 1. Remove claimNoteId from initialValues
pageContent = pageContent.replace(/claimNoteId:\s*"",?\n?/, '');

// 2. Change label from "Record ID" to "Claim Note No"
pageContent = pageContent.replace('label="Record ID"', 'label="Claim Note No"');

// 3. Set claimNoteId payload to use id or nextId
pageContent = pageContent.replace('claimNoteId: Number(data.claimNoteId),', 'claimNoteId: isNewMode ? Number(nextId) : Number(data.id),');

// 4. Remove the LabeledField for claimNoteId
const fieldStart = pageContent.indexOf('<LabeledField\n                        type="number"\n                        label="Claim Note No"');
if (fieldStart !== -1) {
    const fieldEnd = pageContent.indexOf('/>', fieldStart) + 2;
    pageContent = pageContent.substring(0, fieldStart) + pageContent.substring(fieldEnd);
}

fs.writeFileSync(pagePath, pageContent, 'utf8');
console.log('Fixed Claim Note No UI');
