const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/app/(pages)/store/inward-quality-control/page.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
    'const [purchaseOrders, setPurchaseOrders] = useState<{ label: string; value: string }[]>([]);',
    const [purchaseOrders, setPurchaseOrders] = useState<{ label: string; value: string }[]>([]);
    const router = useRouter();
    const [showPrintModal, setShowPrintModal] = useState(false);
    const [vendors, setVendors] = useState<{ label: string; value: string }[]>([]);
    const [printVendorId, setPrintVendorId] = useState("");
    const [printFromDate, setPrintFromDate] = useState("");
    const [printToDate, setPrintToDate] = useState("");
);

content = content.replace(
    /const fetchOptions = async \(\) => \{\s*try \{\s*const \[poRes\] = await Promise\.allSettled\(\[\s*api\.get\(PURCHASE_ORDERS\),\s*\]\);\s*if \(poRes\.status === "fulfilled"\) \{\s*setPurchaseOrders\(\(poRes\.value\.data\.data \|\| \[\]\)\.map\(\(po: any\) => \(\{ label: \PO-\$\{po\.id\}\, value: String\(po\.id\) \}\)\)\);\s*\}/s,
    const fetchOptions = async () => {
        try {
            const [poRes, vendorRes] = await Promise.allSettled([
                api.get(PURCHASE_ORDERS),
                api.get(VENDORS),
            ]);
            if (poRes.status === "fulfilled") {
                setPurchaseOrders((poRes.value.data.data || []).map((po: any) => ({ label: \PO-\\, value: String(po.id) })));
            }
            if (vendorRes.status === "fulfilled") {
                setVendors([
                    { label: "All Vendors", value: "" },
                    ...(vendorRes.value.data.data || []).map((v: any) => ({ label: v.vendorName, value: String(v.id) }))
                ]);
            }
);

content = content.replace(
    'const validRows = data.items.filter(r => r.code && r.itemName && r.poBalQty && r.recQty && r.rejQty && r.okQty);',
    'const validRows = data.items.filter(r => r.code && r.itemName);'
);

content = content.replace(
    'code: validRows.map(r => Number(r.code)),',
    'code: validRows.map(r => Number(r.code) || 0),'
);
content = content.replace(
    'poBalQty: validRows.map(r => Number(r.poBalQty)),',
    'poBalQty: validRows.map(r => Number(r.poBalQty) || 0),'
);
content = content.replace(
    'recQty: validRows.map(r => Number(r.recQty)),',
    'recQty: validRows.map(r => Number(r.recQty) || 0),'
);
content = content.replace(
    'rejQty: validRows.map(r => Number(r.rejQty)),',
    'rejQty: validRows.map(r => Number(r.rejQty) || 0),'
);
content = content.replace(
    'okQty: validRows.map(r => Number(r.okQty)),',
    'okQty: validRows.map(r => Number(r.okQty) || 0),'
);

content = content.replace(
    '<button type="button" className={btnClass}>Pint</button>',
    '<button type="button" onClick={() => setShowPrintModal(true)} className={btnClass}>Print</button>'
);

const modalHtml = 
            </form>

            {/* Print Modal */}
            {showPrintModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
                    <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
                        <h2 className="mb-4 text-xl font-bold text-zinc-900">Print Quality Control Report</h2>
                        <div className="space-y-4">
                            <LabeledSelect
                                label="Vendor Name"
                                options={vendors}
                                value={printVendorId}
                                onChange={(e: any) => setPrintVendorId(e.target.value)}
                            />
                            <div className="grid grid-cols-2 gap-4">
                                <LabeledField
                                    type="date"
                                    label="From Date"
                                    value={printFromDate}
                                    onChange={(e: any) => setPrintFromDate(e.target.value)}
                                />
                                <LabeledField
                                    type="date"
                                    label="To Date"
                                    value={printToDate}
                                    onChange={(e: any) => setPrintToDate(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <Button type="button" variant="outline" onClick={() => setShowPrintModal(false)}>Cancel</Button>
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => {
                                    router.push(\/store/inward-quality-control-report?vendorId=\&fromDate=\&toDate=\&autoFetch=true\);
                                }}
                            >
                                Generate Report
                            </Button>
                        </div>
                    </div>
                </div>
            )}
;

content = content.replace('</form>', modalHtml);

fs.writeFileSync(file, content);
console.log("File updated successfully.");
