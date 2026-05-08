-- Migration: Add TDS fields to invoices table
-- Run this once on your existing database

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS tds_section VARCHAR(10)   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tds_amount  NUMERIC(15,2) DEFAULT 0;

COMMENT ON COLUMN invoices.tds_section IS 'TDS section code e.g. 194C, 194I, 194J';
COMMENT ON COLUMN invoices.tds_amount  IS 'TDS amount deducted at source (reduces AP, credited to TDS Payable 2005)';
