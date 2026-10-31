const fs = require('fs');
const path = 'd:/NaveedAbbasi/TRB/impress/impress-inv/src/app/(pages)/master-entries/inventory/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add new logic
const updateRowFuncStart = '    const updateColorRow = (index: number, field: "stationId" | "color" | "qty", value: string) => {';

const newFunctions = `    const isRowDisabled = (index: number) => {
        if (!isEditing || isOptionsLoading) return true;
        if (index === 0) return false;
        const prevRow = values.colorRows[index - 1];
        return !(prevRow.stationId && prevRow.color && prevRow.qty);
    };

    const addRow = () => {
        setValues((prev) => ({
            ...prev,
            colorRows: [...prev.colorRows, defaultRow()],
        }));
    };

    const canAddRow = values.colorRows.length > 0 && values.colorRows.every(r => r.stationId && r.color && r.qty);

`;

if (content.includes(updateRowFuncStart) && !content.includes('const isRowDisabled')) {
    content = content.replace(updateRowFuncStart, newFunctions + updateRowFuncStart);
}

// 2. Replace disabled={!isEditing || isOptionsLoading} with disabled={isRowDisabled(index)} in tbody
const tableBodyStart = content.indexOf('<tbody>');
const tableBodyEnd = content.indexOf('</tbody>');
if (tableBodyStart !== -1 && tableBodyEnd !== -1) {
    let tbody = content.substring(tableBodyStart, tableBodyEnd);
    tbody = tbody.replace(/disabled=\{\!isEditing\s*\|\|\s*isOptionsLoading\}/g, 'disabled={isRowDisabled(index)}');
    content = content.substring(0, tableBodyStart) + tbody + content.substring(tableBodyEnd);
}

// 3. Add the 'Add More' button
const tableWrapperEnd = '                </div>\n                {errors.colorRows';
const newButtonHtml = `                </div>
                <div className="flex justify-end mt-2">
                    <Button 
                        type="button" 
                        variant="secondary" 
                        shape="rounded" 
                        onClick={addRow} 
                        disabled={!canAddRow || !isEditing}
                        className="border border-zinc-400 bg-white px-4 py-1.5 text-sm hover:bg-zinc-50"
                    >
                        + Add More
                    </Button>
                </div>
                {errors.colorRows`;

if (content.includes(tableWrapperEnd) && !content.includes('onClick={addRow}')) {
    content = content.replace(tableWrapperEnd, newButtonHtml);
}

fs.writeFileSync(path, content, 'utf8');
console.log('Row logic added');
