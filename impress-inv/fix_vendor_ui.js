const fs = require('fs');
const pagePath = 'd:/NaveedAbbasi/TRB/impress/impress-inv/src/app/(pages)/store/rejection-return-to-vendor/page.tsx';
let content = fs.readFileSync(pagePath, 'utf8');

if (!content.includes('LabeledSelect')) {
    content = content.replace('import { LabeledField } from "@/components/ui/LabeledField";', 'import { LabeledField } from "@/components/ui/LabeledField";\nimport { LabeledSelect } from "@/components/ui/LabeledSelect";');
}
if (!content.includes('VENDORS')) {
    content = content.replace('REJECTION_RETURN_TO_VENDOR } from "@/utlis/apiRoutes";', 'REJECTION_RETURN_TO_VENDOR, VENDORS } from "@/utlis/apiRoutes";');
}

const stateInsertion = `    const [vendors, setVendors] = useState<{ id: number; name: string }[]>([]);

    useEffect(() => {
        api.get(VENDORS).then((res) => {
            setVendors(res.data?.data || []);
        }).catch(err => console.error("Failed to fetch vendors", err));
    }, []);

    const fetchNextId`;

if (!content.includes('const [vendors, setVendors]')) {
    content = content.replace('    const fetchNextId', stateInsertion);
}

const oldVendorField = `<LabeledField
                        label="Vendor Name"
                        value={values.vendorName}
                        onChange={handleInputChange("vendorName")}
                        error={errors.vendorName}
                        disabled={!isEditing}
                    />`;
const newVendorField = `<LabeledSelect
                        label="Vendor Name"
                        value={values.vendorName}
                        onChange={(val) => setValues(prev => ({ ...prev, vendorName: val }))}
                        error={errors.vendorName}
                        disabled={!isEditing}
                        options={vendors.map(v => ({ label: v.name, value: v.name }))}
                    />`;

content = content.replace(oldVendorField, newVendorField);

fs.writeFileSync(pagePath, content, 'utf8');
console.log('Vendors added');
