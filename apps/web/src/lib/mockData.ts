import type { Category, Product } from '@kassomat/types';

export const MOCK_CATEGORIES: Category[] = [
  { id: 'cat-1', tenantId: 'demo', name: 'Getränke', color: '#1a6cf5', sortOrder: 1 },
  { id: 'cat-2', tenantId: 'demo', name: 'Speisen', color: '#f5821a', sortOrder: 2 },
  { id: 'cat-3', tenantId: 'demo', name: 'Snacks', color: '#a21af5', sortOrder: 3 },
  { id: 'cat-4', tenantId: 'demo', name: 'Alkohol', color: '#f51a4e', sortOrder: 4 },
  { id: 'cat-5', tenantId: 'demo', name: 'Sonstiges', color: '#1af5d4', sortOrder: 5 },
];

export const MOCK_PRODUCTS: Product[] = [
  // Getränke
  {
    id: 'p-01', tenantId: 'demo', name: 'Cola 0,33l', price: 290, vatRate: 20,
    categoryId: 'cat-1', pluCode: '001', barcode: null, color: '#1a3cf5',
    isActive: true, lieferandoExternalId: null, wixProductId: null,
    createdAt: new Date(), deletedAt: null,
  },
  {
    id: 'p-02', tenantId: 'demo', name: 'Wasser still 0,5l', price: 210, vatRate: 20,
    categoryId: 'cat-1', pluCode: '002', barcode: null, color: '#1a80f5',
    isActive: true, lieferandoExternalId: null, wixProductId: null,
    createdAt: new Date(), deletedAt: null,
  },
  {
    id: 'p-03', tenantId: 'demo', name: 'Orangensaft', price: 350, vatRate: 20,
    categoryId: 'cat-1', pluCode: '003', barcode: null, color: '#f5a01a',
    isActive: true, lieferandoExternalId: null, wixProductId: null,
    createdAt: new Date(), deletedAt: null,
  },
  {
    id: 'p-04', tenantId: 'demo', name: 'Eistee Pfirsich', price: 270, vatRate: 20,
    categoryId: 'cat-1', pluCode: '004', barcode: null, color: '#f5621a',
    isActive: true, lieferandoExternalId: null, wixProductId: null,
    createdAt: new Date(), deletedAt: null,
  },
  {
    id: 'p-05', tenantId: 'demo', name: 'Red Bull 0,25l', price: 390, vatRate: 20,
    categoryId: 'cat-1', pluCode: '005', barcode: null, color: '#1a6cf5',
    isActive: true, lieferandoExternalId: null, wixProductId: null,
    createdAt: new Date(), deletedAt: null,
  },
  {
    id: 'p-06', tenantId: 'demo', name: 'Kaffee', price: 280, vatRate: 10,
    categoryId: 'cat-1', pluCode: '006', barcode: null, color: '#7a4f2a',
    isActive: true, lieferandoExternalId: null, wixProductId: null,
    createdAt: new Date(), deletedAt: null,
  },
  // Speisen
  {
    id: 'p-07', tenantId: 'demo', name: 'Döner Teller', price: 990, vatRate: 10,
    categoryId: 'cat-2', pluCode: '007', barcode: null, color: '#c47a1a',
    isActive: true, lieferandoExternalId: null, wixProductId: null,
    createdAt: new Date(), deletedAt: null,
  },
  {
    id: 'p-08', tenantId: 'demo', name: 'Cheeseburger', price: 850, vatRate: 10,
    categoryId: 'cat-2', pluCode: '008', barcode: null, color: '#d44a1a',
    isActive: true, lieferandoExternalId: null, wixProductId: null,
    createdAt: new Date(), deletedAt: null,
  },
  {
    id: 'p-09', tenantId: 'demo', name: 'Pommes Frites', price: 450, vatRate: 10,
    categoryId: 'cat-2', pluCode: '009', barcode: null, color: '#e4c01a',
    isActive: true, lieferandoExternalId: null, wixProductId: null,
    createdAt: new Date(), deletedAt: null,
  },
  {
    id: 'p-10', tenantId: 'demo', name: 'Pizza Margherita', price: 1290, vatRate: 10,
    categoryId: 'cat-2', pluCode: '010', barcode: null, color: '#d4241a',
    isActive: true, lieferandoExternalId: null, wixProductId: null,
    createdAt: new Date(), deletedAt: null,
  },
  {
    id: 'p-11', tenantId: 'demo', name: 'Wrap Chicken', price: 790, vatRate: 10,
    categoryId: 'cat-2', pluCode: '011', barcode: null, color: '#a47a1a',
    isActive: true, lieferandoExternalId: null, wixProductId: null,
    createdAt: new Date(), deletedAt: null,
  },
  // Snacks
  {
    id: 'p-12', tenantId: 'demo', name: 'Chips Paprika', price: 190, vatRate: 20,
    categoryId: 'cat-3', pluCode: '012', barcode: null, color: '#7a1af5',
    isActive: true, lieferandoExternalId: null, wixProductId: null,
    createdAt: new Date(), deletedAt: null,
  },
  {
    id: 'p-13', tenantId: 'demo', name: 'Schokoriegel', price: 160, vatRate: 20,
    categoryId: 'cat-3', pluCode: '013', barcode: null, color: '#5a1a7a',
    isActive: true, lieferandoExternalId: null, wixProductId: null,
    createdAt: new Date(), deletedAt: null,
  },
  {
    id: 'p-14', tenantId: 'demo', name: 'Gummibärchen', price: 140, vatRate: 20,
    categoryId: 'cat-3', pluCode: '014', barcode: null, color: '#f51af5',
    isActive: true, lieferandoExternalId: null, wixProductId: null,
    createdAt: new Date(), deletedAt: null,
  },
  // Alkohol
  {
    id: 'p-15', tenantId: 'demo', name: 'Bier 0,5l', price: 390, vatRate: 20,
    categoryId: 'cat-4', pluCode: '015', barcode: null, color: '#c47a1a',
    isActive: true, lieferandoExternalId: null, wixProductId: null,
    createdAt: new Date(), deletedAt: null,
  },
  {
    id: 'p-16', tenantId: 'demo', name: 'Wein weiß 0,2l', price: 450, vatRate: 20,
    categoryId: 'cat-4', pluCode: '016', barcode: null, color: '#f5e01a',
    isActive: true, lieferandoExternalId: null, wixProductId: null,
    createdAt: new Date(), deletedAt: null,
  },
  {
    id: 'p-17', tenantId: 'demo', name: 'Prosecco 0,1l', price: 490, vatRate: 20,
    categoryId: 'cat-4', pluCode: '017', barcode: null, color: '#f5c01a',
    isActive: true, lieferandoExternalId: null, wixProductId: null,
    createdAt: new Date(), deletedAt: null,
  },
  // Sonstiges
  {
    id: 'p-18', tenantId: 'demo', name: 'Tabak 20er', price: 590, vatRate: 20,
    categoryId: 'cat-5', pluCode: '018', barcode: null, color: '#1af5d4',
    isActive: true, lieferandoExternalId: null, wixProductId: null,
    createdAt: new Date(), deletedAt: null,
  },
  {
    id: 'p-19', tenantId: 'demo', name: 'Kaugummi', price: 110, vatRate: 20,
    categoryId: 'cat-5', pluCode: '019', barcode: null, color: '#1af5a0',
    isActive: true, lieferandoExternalId: null, wixProductId: null,
    createdAt: new Date(), deletedAt: null,
  },
];
