import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import prisma from "../config/prisma.js";

const accountCodeGroup = ['expenses', 'currentassets', 'liabilities', 'capital', 'revenue', 'purchases', 'otherIncomeAndExpense', 'Expense']

const createAccountCode = asyncHandler(async (req, res) => {
    const { headName, group, items } = req.body;

    if (!headName || !group) {
        throw new ApiError(400, "Head Name and Group are required");
    }
    if (!accountCodeGroup.includes(group)) {
        throw new ApiError(400, "Invalid account code group");
    }

    const codeArr = items?.map(item => item.code || "") || [];
    const nameArr = items?.map(item => item.name || "") || [];
    const addressArr = items?.map(item => item.address || "") || [];
    const contactNoArr = items?.map(item => item.contactNo || "") || [];
    const saleTaxNoArr = items?.map(item => item.saleTaxNo || "") || [];
    const openingBalanceArr = items?.map(item => item.openingBalance ? Number(item.openingBalance) : 0) || [];

    const accountCode = await prisma.accountCode.create({
        data: {
            headName,
            group,
            code: codeArr,
            name: nameArr,
            address: addressArr,
            contactNo: contactNoArr,
            saleTaxNo: saleTaxNoArr,
            openingBalance: openingBalanceArr,
            createdById: req.user?.id
        },
    });

    return res.status(201).json(
        new ApiResponse(
            201,
            accountCode,
            "Account form created successfully"
        )
    );
})


const getAllAccountCodes = asyncHandler(async (req, res) => {
    const accountCodes = await prisma.accountCode.findMany();
    return res.status(200).json(
        new ApiResponse(
            200,
            accountCodes,
            "Account codes fetched successfully"
        )
    );
})

const getByIdAccountCode = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) {
        throw new ApiError(400, "Account form id is required");
    }
    const accountCode = await prisma.accountCode.findUnique({
        where: {
            id: Number(id),
        },
    });

    if (!accountCode) {
        throw new ApiError(404, "Account form not found");
    }
    
    // Reshape arrays into items array for frontend
    const items = accountCode.code.map((c, i) => ({
        code: c,
        name: accountCode.name[i] || "",
        address: accountCode.address[i] || "",
        contactNo: accountCode.contactNo[i] || "",
        saleTaxNo: accountCode.saleTaxNo[i] || "",
        openingBalance: accountCode.openingBalance[i] || 0,
    }));
    
    const reshapedData = {
        ...accountCode,
        items
    };

    return res.status(200).json(
        new ApiResponse(
            200,
            reshapedData,
            "Account form fetched successfully"
        )
    );
})

const updateAccountCode = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { headName, group, items } = req.body;
    
    if (!id) {
        throw new ApiError(400, "Account form id is required");
    }

    const existingCode = await prisma.accountCode.findUnique({
        where: { id: Number(id) }
    });

    if (!existingCode) {
        throw new ApiError(404, "Account form not found");
    }

    const codeArr = items?.map(item => item.code || "") || existingCode.code;
    const nameArr = items?.map(item => item.name || "") || existingCode.name;
    const addressArr = items?.map(item => item.address || "") || existingCode.address;
    const contactNoArr = items?.map(item => item.contactNo || "") || existingCode.contactNo;
    const saleTaxNoArr = items?.map(item => item.saleTaxNo || "") || existingCode.saleTaxNo;
    const openingBalanceArr = items?.map(item => item.openingBalance ? Number(item.openingBalance) : 0) || existingCode.openingBalance;

    const accountCode = await prisma.accountCode.update({
        where: {
            id: Number(id),
        },
        data: {
            headName: headName || existingCode.headName,
            group: group || existingCode.group,
            code: codeArr,
            name: nameArr,
            address: addressArr,
            contactNo: contactNoArr,
            saleTaxNo: saleTaxNoArr,
            openingBalance: openingBalanceArr,
            updatedById: req.user?.id
        },
    });
    return res.status(200).json(
        new ApiResponse(
            200,
            accountCode,
            "Account form updated successfully"
        )
    );
})

const deleteAccountCode = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) {
        throw new ApiError(400, "Account code id is required");
    }
    const existingCode = await prisma.accountCode.findUnique({
        where: { id: Number(id) }
    });

    if (!existingCode) {
        throw new ApiError(404, "Account code not found");
    }

    const accountCode = await prisma.accountCode.delete({
        where: {
            id: Number(id),
        },
    });
    return res.status(200).json(
        new ApiResponse(
            200,
            accountCode,
            "Account code deleted successfully"
        )
    );
})

const getNextId = asyncHandler(async (req, res) => {
    const lastRecord = await prisma.accountCode.findFirst({
        orderBy: { id: 'desc' }
    });
    const nextId = lastRecord ? lastRecord.id + 1 : 1;
    return res.status(200).json(
        new ApiResponse(200, { nextId }, "Next Account Code ID fetched successfully")
    );
});

export default {
    createAccountCode,
    getAllAccountCodes,
    getByIdAccountCode,
    updateAccountCode,
    deleteAccountCode,
    getNextId
}