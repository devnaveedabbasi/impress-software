
"use client";

import { useEffect, useState } from "react";
import { useForm } from "@/hooks/useForm";
import useDebounce from "@/hooks/useDebounce";
import { dealerSchema, type DealerFormValues } from "@/lib/validations/master";
import { DEALERS, CITIES, PROVINCES } from "@/utlis/apiRoutes";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { ViewAllResource, type ViewAllColumn } from "@/components/ui/ViewAllModal";

type ViewAllRow = { id: number; [key: string]: unknown };

import { LabeledField } from "@/components/ui/LabeledField";
import { LabeledSelect } from "@/components/ui/LabeledSelect";

const initialValues: DealerFormValues = {
    id: "",
    dealarShipName: "",
    contactNo: "",
    address: "",
    saleTaxNo: "",
    NTNNo: "",
    name: "",
    provinceId: "",
    cityId: "",
    mobileNo: "",
    opeaningBalance: "",
    dealarType: "single",
    NICNo: "",
};

export default function DealerPage() {
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
        } finally {
            setIsCitiesLoading(false);
        }
    };
    const { hasPermission } = usePermissions();
    const canCreate = hasPermission("dealer", "create");
    const canUpdate = hasPermission("dealer", "update");
    const canView = hasPermission("dealer", "view");
    const dealerColumns: ViewAllColumn<ViewAllRow>[] = [
        { key: "id", header: "Dealer ID" },
        { key: "dealarShipName", header: "Dealership" },
        { key: "name", header: "Contact Person" },
        { key: "contactNo", header: "Contact" },
    ];
    const [isIdLoading, setIsIdLoading] = useState(true);
    const [nextId, setNextId] = useState<string>("");
    const [isProvincesLoading, setIsProvincesLoading] = useState(true);
    const [isCitiesLoading, setIsCitiesLoading] = useState(false);


    const fetchNextId = async () => {
        setIsIdLoading(true);
        try {
            const { data } = await api.get(`${DEALERS}/next-id`);
            const fetchedNextId = String(data.data.nextId);
            setNextId(fetchedNextId);
            setValues({ ...initialValues, id: fetchedNextId });
            setCities([]);
            setIsNewMode(true);
            setIsEditing(true);
        } catch (error) {
            console.error("Failed to fetch next dealer ID", error);
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
        validationSchema: dealerSchema,
        onSubmit: async (data) => {
            const payload = {
                dealarShipName: data.dealarShipName,
                contactNo: data.contactNo,
                address: data.address,
                saleTaxNo: data.saleTaxNo,
                NTNNo: data.NTNNo,
                name: data.name,
                provinceId: Number(data.provinceId),
                cityId: Number(data.cityId),
                mobileNo: data.mobileNo,
                opeaningBalance: Number(data.opeaningBalance),
                dealarType: data.dealarType,
                NICNo: data.NICNo,
            };

            try {
                if (isNewMode) {
                    const response = await api.post(DEALERS, payload);
                    toast.success(response.data.message || "Dealer created successfully");
                } else {
                    const response = await api.put(`${DEALERS}/${data.id}`, payload);
                    toast.success(response.data.message || "Dealer updated successfully");
                }
                fetchNextId();
            } catch (error: any) {
                toast.error(error.response?.data?.message || "Failed to save dealer");
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
            const { data } = await api.get(`${DEALERS}/${debouncedId}`);
            if (data.data) {
                const v = data.data;
                const provinceId = String(v.provinceId);
                await fetchCitiesByProvince(provinceId);

                setValues({
                    id: String(v.id),
                    dealarShipName: v.dealarShipName,
                    contactNo: v.contactNo,
                    address: v.address,
                    saleTaxNo: v.saleTaxNo,
                    NTNNo: v.NTNNo,
                    name: v.name,
                    provinceId,
                    cityId: String(v.cityId),
                    mobileNo: v.mobileNo,
                    opeaningBalance: String(v.opeaningBalance),
                    dealarType: v.dealarType || "single",
                    NICNo: v.NICNo,
                });
                setIsNewMode(false);
                setIsEditing(false);
                toast.success("Dealer found");
            } else {
                toast.error("Dealer not found");
                setValues({ ...initialValues, id: nextId });
                setCities([]);
                setIsNewMode(true);
                setIsEditing(true);
            }
        } catch (error: any) {
            if (error.response?.status === 403) {
                toast.error(error.response?.data?.message || "Access denied. You do not have permission.");
            } else {
                toast.error("Invalid Dealer ID");
            }
            setValues({ ...initialValues, id: nextId });
            setCities([]);
            setIsNewMode(true);
            setIsEditing(true);
        } finally {
            setIsIdLoading(false);
        }
    }
        fetchDebouncedId();
    }, [debouncedId]);;

    const selectedRegion = provinces.find(p => p.value === values.provinceId)?.label || "";

    // Button classes matched with design reference
    const btnClass = "bg-white border border-zinc-400 px-6 py-1.5 text-[15px] text-black hover:bg-zinc-50 active:bg-zinc-100 min-w-[85px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center";

    return (
        <section className="mx-auto mt-10 w-full max-w-4xl bg-form-bg p-8 shadow-sm">
            {/* Title text matched with the image */}
            <h1 className="mb-10 text-center text-4xl text-black tracking-wide">Dealer Profile</h1>

            <form onSubmit={handleSubmit} noValidate>
                {/* Top Section */}
                <div className="flex flex-col md:flex-row justify-between items-start gap-10">
                    <div className="flex-1 w-full space-y-1.5">
                        {/* Dealer ID field included as per original logic */}
                        <LabeledField
                    type={isIdLoading ? "text" : "number"}
                    label="Dealer ID"
                    value={isIdLoading ? "Loading..." : values.id || ""}
                            onChange={handleInputChange("id")}
                            error={errors.id}
                            wrapperClassName="max-w-[200px]"
                        min={1}
                    max={Number(nextId) || 1}
                />
                        <LabeledField
                            label="Dealership Name"
                            value={values.dealarShipName}
                            onChange={handleInputChange("dealarShipName")}
                            error={errors.dealarShipName}
                            disabled={!isEditing}
                        />
                        <LabeledField
                            label="Contact No"
                            value={values.contactNo}
                            onChange={handleInputChange("contactNo")}
                            error={errors.contactNo}
                            disabled={!isEditing}
                        />
                        <LabeledField
                            label="Address"
                            value={values.address}
                            onChange={handleInputChange("address")}
                            error={errors.address}
                            disabled={!isEditing}
                        />
                        <LabeledField
                            label="Sale Tax"
                            value={values.saleTaxNo}
                            onChange={handleInputChange("saleTaxNo")}
                            error={errors.saleTaxNo}
                            disabled={!isEditing}
                        />
                        <LabeledField
                            label="N.T.N.NO"
                            value={values.NTNNo}
                            onChange={handleInputChange("NTNNo")}
                            error={errors.NTNNo}
                            disabled={!isEditing}
                        />
                    </div>

                    {/* Action Buttons - aligned top right in a 2x2 grid to match image */}
                    <div className="grid grid-cols-2 gap-2 shrink-0">
                        <button type="button" onClick={fetchNextId} className={btnClass} disabled={isSubmitting || !canCreate}>New</button>
                        <ViewAllResource
                            endpoint={DEALERS}
                            title="All Dealers"
                            columns={dealerColumns}
                            searchKeys={["id", "dealarShipName", "name", "contactNo"]}
                            canView={canView}
                            onSelectId={(id) => setValues((prev) => ({ ...prev, id: String(id) }))}
                        />
                        <button type="submit" className={btnClass} disabled={!isEditing || isSubmitting}>Save</button>

                        <button type="button" onClick={() => window.open("/print/dealers", "_blank")} className={btnClass}>Print</button>
                        <button type="button" onClick={() => setIsEditing(true)} className={btnClass} disabled={isEditing || isNewMode}>Edit</button>
                    </div>
                </div>

                {/* Information Divider matched with layout design */}
                <div className="flex items-center gap-3 mb-6 mt-6">
                    <span className="text-[14px] text-zinc-900 font-normal">Information</span>
                    <div className="flex-1 h-[1px] bg-zinc-500"></div>
                </div>

                {/* Bottom Section */}
                <div className="flex flex-col md:flex-row gap-6">
                    {/* Left Column */}
                    <div className="flex-1 space-y-1.5">
                        <LabeledField
                            label="Name"
                            value={values.name}
                            onChange={handleInputChange("name")}
                            error={errors.name}
                            disabled={!isEditing}
                        />

                        <LabeledField
                            label="Mobile"
                            value={values.mobileNo}
                            onChange={handleInputChange("mobileNo")}
                            error={errors.mobileNo}
                            disabled={!isEditing}
                        />
                        <LabeledField
                            type="number"
                            label="Opening Balance"
                            value={values.opeaningBalance}
                            onChange={handleInputChange("opeaningBalance")}
                            error={errors.opeaningBalance}
                            disabled={!isEditing}
                        />
                        <LabeledSelect
                            label="Dealer Type"
                            options={[
                                { label: "Single", value: "single" },
                                { label: "Dealer", value: "dealar" }
                            ]}
                            value={values.dealarType}
                            onChange={(e) => handleSelectChange("dealarType")(e)}
                            error={errors.dealarType}
                            disabled={!isEditing}
                        />
                    </div>

                    {/* Right Column */}
                    <div className="flex-1 space-y-1.5">
                        <LabeledField
                            label="N.I.C#"
                            placeholder="12345-1234567-1"
                            value={values.NICNo}
                            onChange={handleCNICChange("NICNo")}
                            error={errors.NICNo}
                            disabled={!isEditing}
                            maxLength={15}
                        />
                        <LabeledSelect
                            label="Province"
                            options={provinces}
                            value={values.provinceId}
                            onChange={(val) => handleProvinceChange(val as string)}
                            error={errors.provinceId}
                            disabled={!isEditing || isProvincesLoading}
                            placeholder={isProvincesLoading ? "Loading provinces..." : "Select Province"}
                        />
                        <LabeledSelect
                            label="City"
                            options={cities}
                            value={values.cityId}
                            onChange={(e) => handleSelectChange("cityId")(e)}
                            error={errors.cityId}
                            disabled={!isEditing || !values.provinceId || isCitiesLoading}
                            placeholder={isCitiesLoading ? "Loading cities..." : values.provinceId ? "Select City" : "Select Province first"}
                        />


                    </div>
                </div>
            </form>
        </section>
    );
}

