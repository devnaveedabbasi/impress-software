"use client";

import { useEffect, useState } from "react";
import { LabeledField } from "@/components/ui/LabeledField";
import { LabeledSelect } from "@/components/ui/LabeledSelect";
import { Button } from "@/components/ui/Button";
import { useForm } from "@/hooks/useForm";
import useDebounce from "@/hooks/useDebounce";
import { vendorSchema, type VendorFormValues } from "@/lib/validations/master";
import { VENDORS, CITIES, PROVINCES } from "@/utlis/apiRoutes";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { ViewAllResource, type ViewAllColumn } from "@/components/ui/ViewAllModal";

type ViewAllRow = { id: number; [key: string]: unknown };

const initialValues: VendorFormValues = {
    id: "",
    vendorName: "",
    address: "",
    provinceId: "",
    cityId: "",
    contactNo: "",
    saleTaxNo: "",
    NICNo: "",
    mobileNo: "",
    daysLimit: "",
    amoutLimit: "",
    NTNNo: "",
    openingBalance: "",
    CNICNo: "",
};

export default function VendorPage() {
    const [isNewMode, setIsNewMode] = useState(true);
    const [isEditing, setIsEditing] = useState(true);
    const [provinces, setProvinces] = useState<{ label: string; value: string }[]>([]);
    const [cities, setCities] = useState<{ label: string; value: string }[]>([]);

    const fetchProvinces = async () => {
        setIsProvincesLoading(true);
        try {
            const { data } = await api.get(PROVINCES);
            if (data.data) {
                setProvinces(data.data.map((p: any) => ({ label: p.name, value: String(p.id) })));
            }
        } catch (error) {
            console.error("Failed to fetch provinces", error);
            toast.error("Failed to load provinces");
        } finally {
            setIsProvincesLoading(false);
        }
    };

    const fetchCitiesByProvince = async (provinceId: string) => {
        if (!provinceId) {
            setCities([]);
            return;
        }
        setIsCitiesLoading(true);
        try {
            const { data } = await api.get(`${CITIES}/province/${provinceId}`);
            if (data.data) {
                setCities(data.data.map((c: any) => ({ label: c.name, value: String(c.id) })));
            }
        } catch (error) {
            console.error("Failed to fetch cities", error);
            toast.error("Failed to load cities");
        } finally {
            setIsCitiesLoading(false);
        }
    };
    const { hasPermission } = usePermissions();
    const canCreate = hasPermission("vendor", "create");
    const canUpdate = hasPermission("vendor", "update");
    const canView = hasPermission("vendor", "view");
    const vendorColumns: ViewAllColumn<ViewAllRow>[] = [
        { key: "id", header: "Vendor ID" },
        { key: "vendorName", header: "Vendor Name" },
        { key: "contactNo", header: "Contact" },
        { key: "cityId", header: "City ID" },
    ];
    const [isIdLoading, setIsIdLoading] = useState(true);
    const [nextId, setNextId] = useState<string>("");
    const [isProvincesLoading, setIsProvincesLoading] = useState(true);
    const [isCitiesLoading, setIsCitiesLoading] = useState(false);


    const fetchNextId = async () => {
        setIsIdLoading(true);
        try {
            const { data } = await api.get(`${VENDORS}/next-id`);
            const fetchedNextId = String(data.data.nextId);
            setNextId(fetchedNextId);
            setValues({ ...initialValues, id: fetchedNextId });
            setCities([]);
            setIsNewMode(true);
            setIsEditing(true);
        } catch (error) {
            console.error("Failed to fetch next vendor ID", error);
        } finally {
            setIsIdLoading(false);
        }
    };

    useEffect(() => {
        fetchNextId();
        fetchProvinces();
    }, []);

    const {
        values,
        errors,
        isLoading: isSubmitting,
        handleInputChange,
        handleCNICChange,
        handleSelectChange,
        handleSubmit,
        setValues,
    } = useForm({
        initialValues,
        validationSchema: vendorSchema,
        onSubmit: async (data) => {
            const payload = {
                vendorName: data.vendorName,
                address: data.address,
                provinceId: Number(data.provinceId),
                cityId: Number(data.cityId),
                contactNo: data.contactNo,
                saleTaxNo: data.saleTaxNo,
                NICNo: data.NICNo,
                mobileNo: data.mobileNo,
                daysLimit: Number(data.daysLimit),
                amoutLimit: Number(data.amoutLimit),
                NTNNo: data.NTNNo,
                openingBalance: Number(data.openingBalance),
                CNICNo: data.CNICNo,
            };

            try {
                if (isNewMode) {
                    const response = await api.post(VENDORS, payload);
                    toast.success(response.data.message || "Vendor created successfully");
                } else {
                    const response = await api.put(`${VENDORS}/${data.id}`, payload);
                    toast.success(response.data.message || "Vendor updated successfully");
                }
                fetchNextId();
            } catch (error: any) {
                toast.error(error.response?.data?.message || "Failed to save vendor");
                throw error;
            }
        },
    });

    const handleProvinceChange = (provinceId: string) => {
        handleSelectChange("provinceId")(provinceId);
        setValues((prev) => ({ ...prev, cityId: "" }));
        fetchCitiesByProvince(provinceId);
    };

    
    const debouncedId = useDebounce(values?.id, 500);

    useEffect(() => {
        const fetchDebouncedId = async () => {
        if (!debouncedId) return;

        if (debouncedId === String(nextId)) {
            setValues({ ...initialValues, id: nextId });
            setIsNewMode(true);
            setIsEditing(true);
            return;
        }

        if (!canView) {
            toast.error("You do not have permission to view or search for this record.");
            setValues({ ...initialValues, id: nextId });
            setIsNewMode(true);
            setIsEditing(true);
            return;
        }

        setIsIdLoading(true);
        try {
            const { data } = await api.get(`${VENDORS}/${debouncedId}`);
            if (data.data) {
                const v = data.data;
                const provinceId = String(v.provinceId);
                await fetchCitiesByProvince(provinceId);

                setValues({
                    id: String(v.id),
                    vendorName: v.vendorName,
                    address: v.address,
                    provinceId,
                    cityId: String(v.cityId),
                    contactNo: v.contactNo,
                    saleTaxNo: v.saleTaxNo,
                    NICNo: v.NICNo,
                    mobileNo: v.mobileNo,
                    daysLimit: String(v.daysLimit),
                    amoutLimit: String(v.amoutLimit),
                    NTNNo: v.NTNNo,
                    openingBalance: String(v.openingBalance),
                    CNICNo: v.CNICNo,
                });
                setIsNewMode(false);
                setIsEditing(false);
                toast.success("Vendor found");
            } else {
                toast.error("Vendor not found");
                setValues({ ...initialValues, id: nextId });
                setCities([]);
                setIsNewMode(true);
            }
        } catch (error: any) {
            if (error.response?.status === 403) {
                toast.error(error.response?.data?.message || "Access denied. You do not have permission.");
            } else {
                toast.error("Vendor not found");
            }
            setValues({ ...initialValues, id: nextId });
            setCities([]);
            setIsNewMode(true);
        } finally {
            setIsIdLoading(false);
        }
    }
        fetchDebouncedId();
    }, [debouncedId]);;

    return (
        <section className="mx-auto mt-10 w-full max-w-4xl bg-form-bg p-6 shadow-xl sm:p-8">
            <h1 className="mb-6 text-center text-2xl font-bold text-zinc-900 sm:text-3xl">Vendor Profile</h1>

            <form onSubmit={handleSubmit} noValidate className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                    <LabeledField
                        type={isIdLoading ? "text" : "number"}
                        label="Vendor ID"
                        value={isIdLoading ? "Loading..." : values.id || ""}
                        onChange={handleInputChange("id")}
                        error={errors.id}
                        wrapperClassName="w-24"
                    min={1}
                    max={Number(nextId) || 1}
                />
                    <LabeledField
                        label="Vendor Name"
                        value={values.vendorName}
                        onChange={handleInputChange("vendorName")}
                        error={errors.vendorName}
                        disabled={!isEditing}
                        wrapperClassName="md:col-span-2"
                        maxLength={100}
                    />

                    <LabeledField
                        label="Address"
                        value={values.address}
                        onChange={handleInputChange("address")}
                        error={errors.address}
                        disabled={!isEditing}
                        wrapperClassName="md:col-span-2"
                        maxLength={255}
                    />

                    <LabeledSelect
                        label="Province"
                        options={provinces}
                        value={values.provinceId}
                        onChange={handleProvinceChange}
                        error={errors.provinceId}
                        disabled={!isEditing || isProvincesLoading}
                        placeholder={isProvincesLoading ? "Loading provinces..." : "Select Province"}
                    />
                    <LabeledSelect
                        label="City"
                        options={cities}
                        value={values.cityId}
                        onChange={handleSelectChange("cityId")}
                        error={errors.cityId}
                        disabled={!isEditing || !values.provinceId || isCitiesLoading}
                        placeholder={isCitiesLoading ? "Loading cities..." : values.provinceId ? "Select City" : "Select Province first"}
                    />

                    <LabeledField
                        label="Contact No"
                        value={values.contactNo}
                        onChange={handleInputChange("contactNo")}
                        error={errors.contactNo}
                        disabled={!isEditing}
                        maxLength={15}
                    />
                    <LabeledField
                        label="Sale Tax No"
                        value={values.saleTaxNo}
                        onChange={handleInputChange("saleTaxNo")}
                        error={errors.saleTaxNo}
                        disabled={!isEditing}
                        maxLength={20}
                    />

                    <LabeledField
                        label="N.I.C No"
                        placeholder="12345-1234567-1"
                        value={values.NICNo}
                        onChange={handleCNICChange("NICNo")}
                        error={errors.NICNo}
                        disabled={!isEditing}
                        maxLength={15}
                    />
                    <LabeledField
                        label="Mobile No"
                        placeholder="03001234567"
                        value={values.mobileNo}
                        onChange={handleInputChange("mobileNo")}
                        error={errors.mobileNo}
                        disabled={!isEditing}
                        maxLength={13}
                    />

                    <LabeledField
                        label="CNIC No"
                        placeholder="12345-1234567-1"
                        value={values.CNICNo}
                        onChange={handleCNICChange("CNICNo")}
                        error={errors.CNICNo}
                        disabled={!isEditing}
                        maxLength={15}
                    />
                    <LabeledField
                        type="number"
                        label="Days Limit"
                        value={values.daysLimit}
                        onChange={handleInputChange("daysLimit")}
                        error={errors.daysLimit}
                        disabled={!isEditing}
                        min={0}
                        max={365}
                    />

                    <LabeledField
                        type="number"
                        label="Account Limit"
                        value={values.amoutLimit}
                        onChange={handleInputChange("amoutLimit")}
                        error={errors.amoutLimit}
                        disabled={!isEditing}
                        min={0}
                        max={100000000}
                    />
                    <LabeledField
                        label="NTN No"
                        placeholder="1234567-8"
                        value={values.NTNNo}
                        onChange={handleInputChange("NTNNo")}
                        error={errors.NTNNo}
                        disabled={!isEditing}
                        maxLength={9}
                    />

                    <LabeledField
                        type="number"
                        label="Opening Balance"
                        value={values.openingBalance}
                        onChange={handleInputChange("openingBalance")}
                        error={errors.openingBalance}
                        disabled={!isEditing}
                        min={-100000000}
                        max={1000000000}
                    />
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3 pt-6">
                    <Button
                        type="button"
                        variant="secondary"
                        shape="rounded"
                        onClick={fetchNextId}
                        disabled={isSubmitting || !canCreate}
                        className="border border-zinc-400 bg-white px-6 hover:bg-zinc-50"
                    >
                        New
                    </Button>
                    <ViewAllResource
                        endpoint={VENDORS}
                        title="All Vendors"
                        columns={vendorColumns}
                        searchKeys={["id", "vendorName", "contactNo"]}
                        canView={canView}
                        onSelectId={(id) => setValues((prev) => ({ ...prev, id: String(id) }))}
                    />
                    <Button
                        type="button"
                        variant="secondary"
                        shape="rounded"
                        onClick={() => setIsEditing(true)}
                        disabled={isSubmitting || isNewMode || isEditing || !canUpdate}
                        className="border border-zinc-400 bg-white px-6 hover:bg-zinc-50"
                    >
                        Edit
                    </Button>

                    <Button
                        type="submit"
                        variant="secondary"
                        shape="rounded"
                        isLoading={isSubmitting}
                        disabled={!isEditing || (isNewMode ? !canCreate : !canUpdate)}
                        className="border border-zinc-400 bg-white px-8 hover:bg-zinc-50"
                    >
                        Save
                    </Button>
                    <Button
                        type="button"
                        variant="secondary"
                        shape="rounded"
                        onClick={() => window.open("/print/vendors", "_blank")}
                        className="border border-zinc-400 bg-white px-6 hover:bg-zinc-50"
                    >
                        Print
                    </Button>
                </div>
            </form>
        </section>
    );
}

