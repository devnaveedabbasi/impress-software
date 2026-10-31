const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
    try {
        await prisma.saleGatePass.create({
            data: {
                date: new Date(),
                accountName: 'New Super Autos',
                billNO: 23,
                throughBy: 'Shakeel Trasnport',
                remarks: '',
                vehicleNo: '234123',
                code: [576],
                itemName: ['Magnet Covered Painted'],
                unit: [3],
                stockInHand: [23],
                qty: [5]
            }
        });
        console.log("Success");
    } catch (e) {
        console.error(e.message);
    } finally {
        await prisma.$disconnect();
    }
}
test();
