export interface MockVehicleOption {
  vehicleNumber: string;
  vehicleType: 'Bike' | 'Van' | 'Truck';
  region: string;
  capacityKg: number;
  driverName: string;
}

export const mockVehicleFleet: MockVehicleOption[] = [
  {
    vehicleNumber: 'KA-01-AB-1234',
    vehicleType: 'Van',
    region: 'Bengaluru Urban',
    capacityKg: 1400,
    driverName: 'Ravi Kumar'
  },
  {
    vehicleNumber: 'KA-05-MN-4488',
    vehicleType: 'Truck',
    region: 'Bengaluru North',
    capacityKg: 5200,
    driverName: 'Suresh R'
  },
  {
    vehicleNumber: 'MH-12-PQ-9910',
    vehicleType: 'Van',
    region: 'Pune City',
    capacityKg: 1650,
    driverName: 'Amit Patil'
  },
  {
    vehicleNumber: 'TN-09-CX-7741',
    vehicleType: 'Truck',
    region: 'Chennai Metro',
    capacityKg: 6100,
    driverName: 'Prakash V'
  },
  {
    vehicleNumber: 'DL-01-EF-5620',
    vehicleType: 'Bike',
    region: 'Delhi NCR',
    capacityKg: 60,
    driverName: 'Imran Khan'
  },
  {
    vehicleNumber: 'GJ-01-ZT-3377',
    vehicleType: 'Van',
    region: 'Ahmedabad',
    capacityKg: 1300,
    driverName: 'Harsh Shah'
  }
];
