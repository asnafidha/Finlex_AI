--
-- PostgreSQL database dump
--

\restrict Nt8XUEJbFndfOJbMj8hIgRB97UFilN8wKqaar1Q1PT6M173fkUGq7kgqyYxBWCo

-- Dumped from database version 14.22 (Ubuntu 14.22-0ubuntu0.22.04.1)
-- Dumped by pg_dump version 14.22 (Ubuntu 14.22-0ubuntu0.22.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: enforce_double_entry(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.enforce_double_entry() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_total_debit  NUMERIC(15,2);
  v_total_credit NUMERIC(15,2);
BEGIN
  SELECT COALESCE(SUM(debit_amount), 0), COALESCE(SUM(credit_amount), 0)
  INTO v_total_debit, v_total_credit
  FROM journal_entry_lines
  WHERE journal_entry_id = NEW.journal_entry_id;

  IF ABS(v_total_debit - v_total_credit) > 0.01 THEN
    RAISE EXCEPTION 'Double-entry violated for journal_entry_id=%: debit=% credit=% diff=%',
      NEW.journal_entry_id, v_total_debit, v_total_credit, (v_total_debit - v_total_credit);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.enforce_double_entry() OWNER TO postgres;

--
-- Name: setup_default_accounts(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.setup_default_accounts(p_company_id integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  g_current_assets    INTEGER;
  g_fixed_assets      INTEGER;
  g_current_liab      INTEGER;
  g_long_term_liab    INTEGER;
  g_equity            INTEGER;
  g_direct_income     INTEGER;
  g_indirect_income   INTEGER;
  g_direct_expense    INTEGER;
  g_indirect_expense  INTEGER;
BEGIN
  INSERT INTO account_groups(company_id,name,type,nature) VALUES(p_company_id,'Current Assets','asset','debit') RETURNING id INTO g_current_assets;
  INSERT INTO account_groups(company_id,name,type,nature) VALUES(p_company_id,'Fixed Assets','asset','debit') RETURNING id INTO g_fixed_assets;
  INSERT INTO account_groups(company_id,name,type,nature) VALUES(p_company_id,'Current Liabilities','liability','credit') RETURNING id INTO g_current_liab;
  INSERT INTO account_groups(company_id,name,type,nature) VALUES(p_company_id,'Long Term Liabilities','liability','credit') RETURNING id INTO g_long_term_liab;
  INSERT INTO account_groups(company_id,name,type,nature) VALUES(p_company_id,'Capital & Reserves','equity','credit') RETURNING id INTO g_equity;
  INSERT INTO account_groups(company_id,name,type,nature) VALUES(p_company_id,'Direct Income','revenue','credit') RETURNING id INTO g_direct_income;
  INSERT INTO account_groups(company_id,name,type,nature) VALUES(p_company_id,'Indirect Income','revenue','credit') RETURNING id INTO g_indirect_income;
  INSERT INTO account_groups(company_id,name,type,nature) VALUES(p_company_id,'Direct Expenses','expense','debit') RETURNING id INTO g_direct_expense;
  INSERT INTO account_groups(company_id,name,type,nature) VALUES(p_company_id,'Indirect Expenses','expense','debit') RETURNING id INTO g_indirect_expense;

  INSERT INTO accounts(company_id,group_id,code,name,type,nature,is_system) VALUES
    (p_company_id,g_current_assets,'1001','Cash in Hand','asset','debit',true),
    (p_company_id,g_current_assets,'1002','Bank Account','asset','debit',true),
    (p_company_id,g_current_assets,'1003','Accounts Receivable','asset','debit',true),
    (p_company_id,g_current_assets,'1004','Input GST (CGST)','asset','debit',true),
    (p_company_id,g_current_assets,'1005','Input GST (SGST)','asset','debit',true),
    (p_company_id,g_current_assets,'1006','Input GST (IGST)','asset','debit',true),
    (p_company_id,g_current_assets,'1007','TDS Receivable','asset','debit',true),
    (p_company_id,g_current_assets,'1008','Advance to Suppliers','asset','debit',false),
    (p_company_id,g_current_assets,'1009','Prepaid Expenses','asset','debit',false),
    (p_company_id,g_current_assets,'1010','Stock / Inventory','asset','debit',false),
    (p_company_id,g_current_assets,'1011','Advance Tax Paid','asset','debit',true),
    (p_company_id,g_current_assets,'1012','Self Assessment Tax Paid','asset','debit',true),
    (p_company_id,g_fixed_assets,'1101','Plant & Machinery','asset','debit',false),
    (p_company_id,g_fixed_assets,'1102','Furniture & Fixtures','asset','debit',false),
    (p_company_id,g_fixed_assets,'1103','Computer Equipment','asset','debit',false),
    (p_company_id,g_fixed_assets,'1104','Land & Building','asset','debit',false),
    (p_company_id,g_fixed_assets,'1105','Accumulated Depreciation','asset','credit',false),
    (p_company_id,g_current_liab,'2001','Accounts Payable','liability','credit',true),
    (p_company_id,g_current_liab,'2002','Output GST (CGST)','liability','credit',true),
    (p_company_id,g_current_liab,'2003','Output GST (SGST)','liability','credit',true),
    (p_company_id,g_current_liab,'2004','Output GST (IGST)','liability','credit',true),
    (p_company_id,g_current_liab,'2005','TDS Payable','liability','credit',true),
    (p_company_id,g_current_liab,'2006','Advance from Customers','liability','credit',false),
    (p_company_id,g_current_liab,'2007','Salary Payable','liability','credit',false),
    (p_company_id,g_current_liab,'2008','PF Payable','liability','credit',false),
    (p_company_id,g_current_liab,'2009','ESIC Payable','liability','credit',false),
    (p_company_id,g_long_term_liab,'2101','Bank Loan','liability','credit',false),
    (p_company_id,g_long_term_liab,'2102','Directors Loan','liability','credit',false),
    (p_company_id,g_equity,'3001','Share Capital','equity','credit',true),
    (p_company_id,g_equity,'3002','Retained Earnings','equity','credit',true),
    (p_company_id,g_equity,'3003','Current Year Profit / Loss','equity','credit',true),
    (p_company_id,g_direct_income,'4001','Sales Revenue','revenue','credit',true),
    (p_company_id,g_direct_income,'4002','Service Revenue','revenue','credit',true),
    (p_company_id,g_direct_income,'4003','Sales Returns & Allowances','revenue','debit',false),
    (p_company_id,g_indirect_income,'4101','Interest Income','revenue','credit',false),
    (p_company_id,g_indirect_income,'4102','Discount Received','revenue','credit',false),
    (p_company_id,g_indirect_income,'4103','Other Income','revenue','credit',false),
    (p_company_id,g_direct_expense,'5001','Purchases','expense','debit',true),
    (p_company_id,g_direct_expense,'5002','Purchase Returns','expense','credit',false),
    (p_company_id,g_direct_expense,'5003','Direct Labour','expense','debit',false),
    (p_company_id,g_indirect_expense,'5101','Salaries & Wages','expense','debit',true),
    (p_company_id,g_indirect_expense,'5102','Rent','expense','debit',false),
    (p_company_id,g_indirect_expense,'5103','Electricity','expense','debit',false),
    (p_company_id,g_indirect_expense,'5104','Internet & Phone','expense','debit',false),
    (p_company_id,g_indirect_expense,'5105','Office Supplies','expense','debit',false),
    (p_company_id,g_indirect_expense,'5106','Travel & Conveyance','expense','debit',false),
    (p_company_id,g_indirect_expense,'5107','Professional Fees','expense','debit',false),
    (p_company_id,g_indirect_expense,'5108','Bank Charges','expense','debit',false),
    (p_company_id,g_indirect_expense,'5109','Depreciation','expense','debit',true),
    (p_company_id,g_indirect_expense,'5110','Interest on Loan','expense','debit',false),
    (p_company_id,g_indirect_expense,'5111','GST Late Fee','expense','debit',false),
    (p_company_id,g_indirect_expense,'5112','Miscellaneous Expense','expense','debit',false),
    (p_company_id,g_indirect_expense,'5113','PF Employer Contribution','expense','debit',false),
    (p_company_id,g_indirect_expense,'5114','ESIC Employer Contribution','expense','debit',false);

  RAISE NOTICE 'Default Chart of Accounts created for company %', p_company_id;
END;
$$;


ALTER FUNCTION public.setup_default_accounts(p_company_id integer) OWNER TO postgres;

--
-- Name: sync_opening_balance(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.sync_opening_balance() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.opening_debit > 0 AND NEW.opening_credit > 0 THEN
    RAISE EXCEPTION 'opening_debit and opening_credit cannot both be > 0 on account %', NEW.id;
  END IF;
  NEW.opening_balance := NEW.opening_debit - NEW.opening_credit;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.sync_opening_balance() OWNER TO postgres;

--
-- Name: update_timestamp(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_timestamp() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: account_groups; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.account_groups (
    id integer NOT NULL,
    company_id integer,
    name character varying(100) NOT NULL,
    type character varying(20) NOT NULL,
    nature character varying(10) NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.account_groups OWNER TO postgres;

--
-- Name: account_groups_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.account_groups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.account_groups_id_seq OWNER TO postgres;

--
-- Name: account_groups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.account_groups_id_seq OWNED BY public.account_groups.id;


--
-- Name: accounts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.accounts (
    id integer NOT NULL,
    company_id integer,
    group_id integer,
    code character varying(10) NOT NULL,
    name character varying(150) NOT NULL,
    type character varying(20) NOT NULL,
    sub_type character varying(50),
    nature character varying(10) DEFAULT 'debit'::character varying,
    parent_id integer,
    is_system boolean DEFAULT false,
    opening_balance numeric(15,2) DEFAULT 0,
    balance numeric(15,2) DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    opening_balance_debit numeric(15,2) DEFAULT 0,
    opening_balance_credit numeric(15,2) DEFAULT 0,
    opening_debit numeric(15,2) DEFAULT 0 NOT NULL,
    opening_credit numeric(15,2) DEFAULT 0 NOT NULL,
    CONSTRAINT chk_opening_credit_nonneg CHECK ((opening_credit >= (0)::numeric)),
    CONSTRAINT chk_opening_debit_nonneg CHECK ((opening_debit >= (0)::numeric)),
    CONSTRAINT chk_opening_one_side_only CHECK (((opening_debit = (0)::numeric) OR (opening_credit = (0)::numeric)))
);


ALTER TABLE public.accounts OWNER TO postgres;

--
-- Name: accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.accounts_id_seq OWNER TO postgres;

--
-- Name: accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.accounts_id_seq OWNED BY public.accounts.id;


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_log (
    id integer NOT NULL,
    company_id integer,
    user_id integer,
    action character varying(50) NOT NULL,
    table_name character varying(50),
    record_id integer,
    old_values jsonb,
    new_values jsonb,
    ip_address character varying(45),
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.audit_log OWNER TO postgres;

--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.audit_log_id_seq OWNER TO postgres;

--
-- Name: audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;


--
-- Name: bank_statements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.bank_statements (
    id integer NOT NULL,
    company_id integer,
    account_id integer,
    statement_date date NOT NULL,
    description character varying(300) NOT NULL,
    debit_amount numeric(15,2) DEFAULT 0,
    credit_amount numeric(15,2) DEFAULT 0,
    balance numeric(15,2) DEFAULT 0,
    reference character varying(100),
    matched boolean DEFAULT false,
    matched_je_id integer,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.bank_statements OWNER TO postgres;

--
-- Name: bank_statements_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.bank_statements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.bank_statements_id_seq OWNER TO postgres;

--
-- Name: bank_statements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.bank_statements_id_seq OWNED BY public.bank_statements.id;


--
-- Name: ca_company_access; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ca_company_access (
    id integer NOT NULL,
    ca_id integer,
    company_id integer,
    role character varying(20) DEFAULT 'owner'::character varying,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.ca_company_access OWNER TO postgres;

--
-- Name: ca_company_access_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ca_company_access_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.ca_company_access_id_seq OWNER TO postgres;

--
-- Name: ca_company_access_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.ca_company_access_id_seq OWNED BY public.ca_company_access.id;


--
-- Name: client_tasks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.client_tasks (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    ca_id uuid NOT NULL,
    company_id uuid NOT NULL,
    title character varying(200) NOT NULL,
    description text,
    priority character varying(10) DEFAULT 'medium'::character varying,
    status character varying(20) DEFAULT 'open'::character varying,
    due_date date,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.client_tasks OWNER TO postgres;

--
-- Name: companies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.companies (
    id integer NOT NULL,
    name character varying(200) NOT NULL,
    gstin character varying(15),
    pan character varying(10),
    state_code character varying(2),
    state_name character varying(100),
    financial_year character varying(9) DEFAULT '2024-25'::character varying NOT NULL,
    fy_start_date date,
    fy_end_date date,
    address text,
    phone character varying(15),
    email character varying(150),
    business_type character varying(50) DEFAULT 'private_limited'::character varying,
    gst_registered boolean DEFAULT true,
    created_by integer,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    tan character varying(10) DEFAULT NULL::character varying,
    closing_entries_posted boolean DEFAULT false NOT NULL,
    closing_entries_date date
);


ALTER TABLE public.companies OWNER TO postgres;

--
-- Name: COLUMN companies.tan; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.companies.tan IS 'Tax Deduction Account Number for TDS returns (Form 26Q/27Q)';


--
-- Name: companies_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.companies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.companies_id_seq OWNER TO postgres;

--
-- Name: companies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.companies_id_seq OWNED BY public.companies.id;


--
-- Name: compliance_deadlines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.compliance_deadlines (
    id integer NOT NULL,
    company_id integer,
    type character varying(20) NOT NULL,
    name character varying(200) NOT NULL,
    due_date date NOT NULL,
    financial_year character varying(9),
    period character varying(20),
    status character varying(20) DEFAULT 'pending'::character varying,
    notes text,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.compliance_deadlines OWNER TO postgres;

--
-- Name: compliance_deadlines_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.compliance_deadlines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.compliance_deadlines_id_seq OWNER TO postgres;

--
-- Name: compliance_deadlines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.compliance_deadlines_id_seq OWNED BY public.compliance_deadlines.id;


--
-- Name: credit_debit_note_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.credit_debit_note_items (
    id integer NOT NULL,
    note_id integer,
    description character varying(300) NOT NULL,
    hsn_sac_code character varying(10),
    quantity numeric(10,3) NOT NULL,
    unit character varying(20) DEFAULT 'NOS'::character varying,
    rate numeric(15,2) NOT NULL,
    taxable_amount numeric(15,2) NOT NULL,
    gst_rate numeric(5,2) DEFAULT 18,
    cgst_amount numeric(15,2) DEFAULT 0,
    sgst_amount numeric(15,2) DEFAULT 0,
    igst_amount numeric(15,2) DEFAULT 0,
    total_amount numeric(15,2) NOT NULL
);


ALTER TABLE public.credit_debit_note_items OWNER TO postgres;

--
-- Name: credit_debit_note_items_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.credit_debit_note_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.credit_debit_note_items_id_seq OWNER TO postgres;

--
-- Name: credit_debit_note_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.credit_debit_note_items_id_seq OWNED BY public.credit_debit_note_items.id;


--
-- Name: credit_debit_notes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.credit_debit_notes (
    id integer NOT NULL,
    company_id integer,
    note_type character varying(10) NOT NULL,
    note_number character varying(50) NOT NULL,
    note_date date NOT NULL,
    original_invoice_id integer,
    original_invoice_number character varying(50),
    party_name character varying(200) NOT NULL,
    party_gstin character varying(15),
    party_state character varying(2),
    reason character varying(200),
    subtotal numeric(15,2) DEFAULT 0,
    taxable_amount numeric(15,2) DEFAULT 0,
    cgst_amount numeric(15,2) DEFAULT 0,
    sgst_amount numeric(15,2) DEFAULT 0,
    igst_amount numeric(15,2) DEFAULT 0,
    total_amount numeric(15,2) DEFAULT 0,
    status character varying(20) DEFAULT 'confirmed'::character varying,
    created_by integer,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.credit_debit_notes OWNER TO postgres;

--
-- Name: credit_debit_notes_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.credit_debit_notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.credit_debit_notes_id_seq OWNER TO postgres;

--
-- Name: credit_debit_notes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.credit_debit_notes_id_seq OWNED BY public.credit_debit_notes.id;


--
-- Name: depreciation_entries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.depreciation_entries (
    id integer NOT NULL,
    company_id integer,
    asset_id integer,
    financial_year character varying(9) NOT NULL,
    opening_wdv numeric(15,2) NOT NULL,
    depreciation numeric(15,2) NOT NULL,
    closing_wdv numeric(15,2) NOT NULL,
    method character varying(10) NOT NULL,
    journal_entry_id integer,
    created_by integer,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.depreciation_entries OWNER TO postgres;

--
-- Name: depreciation_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.depreciation_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.depreciation_entries_id_seq OWNER TO postgres;

--
-- Name: depreciation_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.depreciation_entries_id_seq OWNED BY public.depreciation_entries.id;


--
-- Name: document_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.document_requests (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    ca_id uuid NOT NULL,
    company_id uuid NOT NULL,
    title character varying(200) NOT NULL,
    description text,
    status character varying(20) DEFAULT 'pending'::character varying,
    due_date date,
    received_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.document_requests OWNER TO postgres;

--
-- Name: financial_statement_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.financial_statement_config (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    account_id uuid NOT NULL,
    statement character varying(20) NOT NULL,
    section character varying(50) NOT NULL,
    display_order integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.financial_statement_config OWNER TO postgres;

--
-- Name: fixed_assets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fixed_assets (
    id integer NOT NULL,
    company_id integer,
    asset_name character varying(200) NOT NULL,
    asset_code character varying(50),
    category character varying(50),
    purchase_date date NOT NULL,
    cost_price numeric(15,2) NOT NULL,
    salvage_value numeric(15,2) DEFAULT 0,
    useful_life_years integer DEFAULT 5,
    method character varying(10) DEFAULT 'SLM'::character varying,
    wdv_rate numeric(5,2) DEFAULT 20,
    current_wdv numeric(15,2),
    account_id integer,
    is_active boolean DEFAULT true,
    created_by integer,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.fixed_assets OWNER TO postgres;

--
-- Name: fixed_assets_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.fixed_assets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.fixed_assets_id_seq OWNER TO postgres;

--
-- Name: fixed_assets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.fixed_assets_id_seq OWNED BY public.fixed_assets.id;


--
-- Name: gst_rates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.gst_rates (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    hsn_code character varying(10),
    sac_code character varying(10),
    description character varying(300),
    gst_rate numeric(5,2) NOT NULL,
    cess_rate numeric(5,2) DEFAULT 0,
    effective_from date DEFAULT '2017-07-01'::date,
    is_active boolean DEFAULT true
);


ALTER TABLE public.gst_rates OWNER TO postgres;

--
-- Name: gst_returns; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.gst_returns (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    return_type character varying(20) NOT NULL,
    period_month integer,
    period_year integer NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    due_date date,
    filed_date date,
    total_tax numeric(15,2) DEFAULT 0,
    igst numeric(15,2) DEFAULT 0,
    cgst numeric(15,2) DEFAULT 0,
    sgst numeric(15,2) DEFAULT 0,
    itc_claimed numeric(15,2) DEFAULT 0,
    net_payable numeric(15,2) DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT gst_returns_period_month_check CHECK (((period_month >= 1) AND (period_month <= 12))),
    CONSTRAINT gst_returns_return_type_check CHECK (((return_type)::text = ANY ((ARRAY['GSTR1'::character varying, 'GSTR3B'::character varying, 'GSTR9'::character varying, 'GSTR2B'::character varying])::text[]))),
    CONSTRAINT gst_returns_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'prepared'::character varying, 'filed'::character varying, 'late_filed'::character varying])::text[])))
);


ALTER TABLE public.gst_returns OWNER TO postgres;

--
-- Name: invoice_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.invoice_items (
    id integer NOT NULL,
    invoice_id integer,
    description character varying(300) NOT NULL,
    hsn_sac_code character varying(10),
    quantity numeric(10,3) NOT NULL,
    unit character varying(20) DEFAULT 'NOS'::character varying,
    rate numeric(15,2) NOT NULL,
    taxable_amount numeric(15,2) NOT NULL,
    gst_rate numeric(5,2) DEFAULT 18,
    cgst_rate numeric(5,2) DEFAULT 9,
    sgst_rate numeric(5,2) DEFAULT 9,
    igst_rate numeric(5,2) DEFAULT 0,
    cgst_amount numeric(15,2) DEFAULT 0,
    sgst_amount numeric(15,2) DEFAULT 0,
    igst_amount numeric(15,2) DEFAULT 0,
    total_amount numeric(15,2) NOT NULL,
    account_id integer
);


ALTER TABLE public.invoice_items OWNER TO postgres;

--
-- Name: invoice_items_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.invoice_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.invoice_items_id_seq OWNER TO postgres;

--
-- Name: invoice_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.invoice_items_id_seq OWNED BY public.invoice_items.id;


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.invoices (
    id integer NOT NULL,
    company_id integer,
    invoice_type character varying(20) NOT NULL,
    invoice_number character varying(50) NOT NULL,
    invoice_date date NOT NULL,
    due_date date,
    party_name character varying(200) NOT NULL,
    party_gstin character varying(15),
    party_address text,
    party_state character varying(50),
    subtotal numeric(15,2) DEFAULT 0,
    taxable_amount numeric(15,2) DEFAULT 0,
    cgst_amount numeric(15,2) DEFAULT 0,
    sgst_amount numeric(15,2) DEFAULT 0,
    igst_amount numeric(15,2) DEFAULT 0,
    total_amount numeric(15,2) DEFAULT 0,
    status character varying(20) DEFAULT 'confirmed'::character varying,
    payment_status character varying(20) DEFAULT 'unpaid'::character varying,
    supply_type character varying(20) DEFAULT 'regular'::character varying,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    tds_section character varying(10) DEFAULT NULL::character varying,
    tds_amount numeric(15,2) DEFAULT 0
);


ALTER TABLE public.invoices OWNER TO postgres;

--
-- Name: COLUMN invoices.tds_section; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.invoices.tds_section IS 'TDS section code e.g. 194C, 194I, 194J';


--
-- Name: COLUMN invoices.tds_amount; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.invoices.tds_amount IS 'TDS amount deducted at source (reduces AP, credited to TDS Payable 2005)';


--
-- Name: invoices_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.invoices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.invoices_id_seq OWNER TO postgres;

--
-- Name: invoices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.invoices_id_seq OWNED BY public.invoices.id;


--
-- Name: journal_entries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.journal_entries (
    id integer NOT NULL,
    company_id integer,
    entry_number character varying(20),
    entry_date date NOT NULL,
    reference_type character varying(20),
    reference_id integer,
    narration text NOT NULL,
    is_posted boolean DEFAULT true,
    created_by integer,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.journal_entries OWNER TO postgres;

--
-- Name: journal_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.journal_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.journal_entries_id_seq OWNER TO postgres;

--
-- Name: journal_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.journal_entries_id_seq OWNED BY public.journal_entries.id;


--
-- Name: journal_entry_lines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.journal_entry_lines (
    id integer NOT NULL,
    journal_entry_id integer,
    account_id integer,
    debit_amount numeric(15,2) DEFAULT 0,
    credit_amount numeric(15,2) DEFAULT 0,
    narration character varying(300),
    CONSTRAINT debit_or_credit CHECK ((((debit_amount > (0)::numeric) AND (credit_amount = (0)::numeric)) OR ((credit_amount > (0)::numeric) AND (debit_amount = (0)::numeric)) OR ((debit_amount = (0)::numeric) AND (credit_amount = (0)::numeric))))
);


ALTER TABLE public.journal_entry_lines OWNER TO postgres;

--
-- Name: journal_entry_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.journal_entry_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.journal_entry_lines_id_seq OWNER TO postgres;

--
-- Name: journal_entry_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.journal_entry_lines_id_seq OWNED BY public.journal_entry_lines.id;


--
-- Name: opening_balance_imports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.opening_balance_imports (
    id integer NOT NULL,
    company_id integer,
    import_date date DEFAULT CURRENT_DATE NOT NULL,
    financial_year character varying(9) NOT NULL,
    total_debit numeric(15,2) DEFAULT 0,
    total_credit numeric(15,2) DEFAULT 0,
    is_balanced boolean DEFAULT false,
    imported_by integer,
    created_at timestamp without time zone DEFAULT now(),
    as_of_date date
);


ALTER TABLE public.opening_balance_imports OWNER TO postgres;

--
-- Name: opening_balance_imports_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.opening_balance_imports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.opening_balance_imports_id_seq OWNER TO postgres;

--
-- Name: opening_balance_imports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.opening_balance_imports_id_seq OWNED BY public.opening_balance_imports.id;


--
-- Name: parties; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.parties (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id integer,
    name character varying(200) NOT NULL,
    type character varying(10) NOT NULL,
    gstin character varying(15),
    pan character varying(10),
    state_code character varying(50),
    state_name character varying(50),
    address text,
    email character varying(150),
    phone character varying(15),
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT parties_type_check CHECK (((type)::text = ANY ((ARRAY['customer'::character varying, 'supplier'::character varying, 'both'::character varying])::text[])))
);


ALTER TABLE public.parties OWNER TO postgres;

--
-- Name: payroll_entries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payroll_entries (
    id integer NOT NULL,
    company_id integer,
    employee_name character varying(200) NOT NULL,
    employee_pan character varying(10),
    month integer NOT NULL,
    year integer NOT NULL,
    gross_salary numeric(15,2) NOT NULL,
    basic numeric(15,2) DEFAULT 0,
    hra numeric(15,2) DEFAULT 0,
    allowances numeric(15,2) DEFAULT 0,
    pf_employee numeric(15,2) DEFAULT 0,
    pf_employer numeric(15,2) DEFAULT 0,
    esic_employee numeric(15,2) DEFAULT 0,
    esic_employer numeric(15,2) DEFAULT 0,
    tds_amount numeric(15,2) DEFAULT 0,
    other_deductions numeric(15,2) DEFAULT 0,
    net_salary numeric(15,2) NOT NULL,
    payment_date date,
    payment_mode character varying(20) DEFAULT 'bank'::character varying,
    journal_entry_id integer,
    created_by integer,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.payroll_entries OWNER TO postgres;

--
-- Name: payroll_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.payroll_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.payroll_entries_id_seq OWNER TO postgres;

--
-- Name: payroll_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.payroll_entries_id_seq OWNED BY public.payroll_entries.id;


--
-- Name: tds_entries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tds_entries (
    id integer NOT NULL,
    company_id integer,
    party_name character varying(200) NOT NULL,
    party_pan character varying(10),
    section character varying(10) NOT NULL,
    gross_amount numeric(15,2) NOT NULL,
    tds_rate numeric(5,2) NOT NULL,
    tds_amount numeric(15,2) NOT NULL,
    net_amount numeric(15,2) NOT NULL,
    payment_date date NOT NULL,
    payment_nature character varying(100),
    challan_no character varying(50),
    created_by integer,
    created_at timestamp without time zone DEFAULT now(),
    deposited boolean DEFAULT false,
    deposit_date date
);


ALTER TABLE public.tds_entries OWNER TO postgres;

--
-- Name: COLUMN tds_entries.deposited; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.tds_entries.deposited IS 'Whether TDS has been deposited to govt via challan';


--
-- Name: tds_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.tds_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.tds_entries_id_seq OWNER TO postgres;

--
-- Name: tds_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.tds_entries_id_seq OWNED BY public.tds_entries.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    email character varying(150) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(20) DEFAULT 'ca'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.users_id_seq OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: account_groups id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_groups ALTER COLUMN id SET DEFAULT nextval('public.account_groups_id_seq'::regclass);


--
-- Name: accounts id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accounts ALTER COLUMN id SET DEFAULT nextval('public.accounts_id_seq'::regclass);


--
-- Name: audit_log id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_log ALTER COLUMN id SET DEFAULT nextval('public.audit_log_id_seq'::regclass);


--
-- Name: bank_statements id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bank_statements ALTER COLUMN id SET DEFAULT nextval('public.bank_statements_id_seq'::regclass);


--
-- Name: ca_company_access id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ca_company_access ALTER COLUMN id SET DEFAULT nextval('public.ca_company_access_id_seq'::regclass);


--
-- Name: companies id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.companies ALTER COLUMN id SET DEFAULT nextval('public.companies_id_seq'::regclass);


--
-- Name: compliance_deadlines id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compliance_deadlines ALTER COLUMN id SET DEFAULT nextval('public.compliance_deadlines_id_seq'::regclass);


--
-- Name: credit_debit_note_items id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.credit_debit_note_items ALTER COLUMN id SET DEFAULT nextval('public.credit_debit_note_items_id_seq'::regclass);


--
-- Name: credit_debit_notes id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.credit_debit_notes ALTER COLUMN id SET DEFAULT nextval('public.credit_debit_notes_id_seq'::regclass);


--
-- Name: depreciation_entries id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.depreciation_entries ALTER COLUMN id SET DEFAULT nextval('public.depreciation_entries_id_seq'::regclass);


--
-- Name: fixed_assets id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fixed_assets ALTER COLUMN id SET DEFAULT nextval('public.fixed_assets_id_seq'::regclass);


--
-- Name: invoice_items id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_items ALTER COLUMN id SET DEFAULT nextval('public.invoice_items_id_seq'::regclass);


--
-- Name: invoices id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices ALTER COLUMN id SET DEFAULT nextval('public.invoices_id_seq'::regclass);


--
-- Name: journal_entries id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journal_entries ALTER COLUMN id SET DEFAULT nextval('public.journal_entries_id_seq'::regclass);


--
-- Name: journal_entry_lines id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journal_entry_lines ALTER COLUMN id SET DEFAULT nextval('public.journal_entry_lines_id_seq'::regclass);


--
-- Name: opening_balance_imports id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opening_balance_imports ALTER COLUMN id SET DEFAULT nextval('public.opening_balance_imports_id_seq'::regclass);


--
-- Name: payroll_entries id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payroll_entries ALTER COLUMN id SET DEFAULT nextval('public.payroll_entries_id_seq'::regclass);


--
-- Name: tds_entries id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tds_entries ALTER COLUMN id SET DEFAULT nextval('public.tds_entries_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: account_groups; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.account_groups (id, company_id, name, type, nature, created_at) FROM stdin;
1	1	Current Assets	asset	debit	2026-04-01 16:32:33.888345
2	1	Fixed Assets	asset	debit	2026-04-01 16:32:33.888345
3	1	Current Liabilities	liability	credit	2026-04-01 16:32:33.888345
4	1	Long Term Liabilities	liability	credit	2026-04-01 16:32:33.888345
5	1	Capital & Reserves	equity	credit	2026-04-01 16:32:33.888345
6	1	Direct Income	revenue	credit	2026-04-01 16:32:33.888345
7	1	Indirect Income	revenue	credit	2026-04-01 16:32:33.888345
8	1	Direct Expenses	expense	debit	2026-04-01 16:32:33.888345
9	1	Indirect Expenses	expense	debit	2026-04-01 16:32:33.888345
10	2	Current Assets	asset	debit	2026-04-01 16:32:33.893525
11	2	Fixed Assets	asset	debit	2026-04-01 16:32:33.893525
12	2	Current Liabilities	liability	credit	2026-04-01 16:32:33.893525
13	2	Long Term Liabilities	liability	credit	2026-04-01 16:32:33.893525
14	2	Capital & Reserves	equity	credit	2026-04-01 16:32:33.893525
15	2	Direct Income	revenue	credit	2026-04-01 16:32:33.893525
16	2	Indirect Income	revenue	credit	2026-04-01 16:32:33.893525
17	2	Direct Expenses	expense	debit	2026-04-01 16:32:33.893525
18	2	Indirect Expenses	expense	debit	2026-04-01 16:32:33.893525
28	6	Current Assets	asset	debit	2026-04-03 20:21:13.789862
29	6	Fixed Assets	asset	debit	2026-04-03 20:21:13.789862
30	6	Current Liabilities	liability	credit	2026-04-03 20:21:13.789862
31	6	Long Term Liabilities	liability	credit	2026-04-03 20:21:13.789862
32	6	Capital & Reserves	equity	credit	2026-04-03 20:21:13.789862
33	6	Direct Income	revenue	credit	2026-04-03 20:21:13.789862
34	6	Indirect Income	revenue	credit	2026-04-03 20:21:13.789862
35	6	Direct Expenses	expense	debit	2026-04-03 20:21:13.789862
36	6	Indirect Expenses	expense	debit	2026-04-03 20:21:13.789862
37	7	Current Assets	asset	debit	2026-04-04 14:07:59.09287
38	7	Fixed Assets	asset	debit	2026-04-04 14:07:59.09287
39	7	Current Liabilities	liability	credit	2026-04-04 14:07:59.09287
40	7	Long Term Liabilities	liability	credit	2026-04-04 14:07:59.09287
41	7	Capital & Reserves	equity	credit	2026-04-04 14:07:59.09287
42	7	Direct Income	revenue	credit	2026-04-04 14:07:59.09287
43	7	Indirect Income	revenue	credit	2026-04-04 14:07:59.09287
44	7	Direct Expenses	expense	debit	2026-04-04 14:07:59.09287
45	7	Indirect Expenses	expense	debit	2026-04-04 14:07:59.09287
\.


--
-- Data for Name: accounts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.accounts (id, company_id, group_id, code, name, type, sub_type, nature, parent_id, is_system, opening_balance, balance, created_at, opening_balance_debit, opening_balance_credit, opening_debit, opening_credit) FROM stdin;
3	1	1	1003	Accounts Receivable	asset	\N	debit	\N	t	0.00	0.00	2026-04-01 16:32:33.898681	0.00	0.00	0.00	0.00
4	1	1	1004	Input GST (CGST)	asset	\N	debit	\N	t	0.00	0.00	2026-04-01 16:32:33.898681	0.00	0.00	0.00	0.00
5	1	1	1005	Input GST (SGST)	asset	\N	debit	\N	t	0.00	0.00	2026-04-01 16:32:33.898681	0.00	0.00	0.00	0.00
6	1	1	1006	Input GST (IGST)	asset	\N	debit	\N	t	0.00	0.00	2026-04-01 16:32:33.898681	0.00	0.00	0.00	0.00
7	1	1	1007	TDS Receivable	asset	\N	debit	\N	f	0.00	0.00	2026-04-01 16:32:33.898681	0.00	0.00	0.00	0.00
9	1	3	2001	Accounts Payable	liability	\N	credit	\N	t	0.00	0.00	2026-04-01 16:32:33.898681	0.00	0.00	0.00	0.00
10	1	3	2002	Output GST (CGST)	liability	\N	credit	\N	t	0.00	0.00	2026-04-01 16:32:33.898681	0.00	0.00	0.00	0.00
11	1	3	2003	Output GST (SGST)	liability	\N	credit	\N	t	0.00	0.00	2026-04-01 16:32:33.898681	0.00	0.00	0.00	0.00
12	1	3	2004	Output GST (IGST)	liability	\N	credit	\N	t	0.00	0.00	2026-04-01 16:32:33.898681	0.00	0.00	0.00	0.00
13	1	3	2005	TDS Payable	liability	\N	credit	\N	t	0.00	0.00	2026-04-01 16:32:33.898681	0.00	0.00	0.00	0.00
16	1	6	4001	Sales Revenue	revenue	\N	credit	\N	t	0.00	0.00	2026-04-01 16:32:33.898681	0.00	0.00	0.00	0.00
17	1	6	4002	Service Revenue	revenue	\N	credit	\N	t	0.00	0.00	2026-04-01 16:32:33.898681	0.00	0.00	0.00	0.00
18	1	7	4101	Other Income	revenue	\N	credit	\N	f	0.00	0.00	2026-04-01 16:32:33.898681	0.00	0.00	0.00	0.00
19	1	8	5001	Purchases	expense	\N	debit	\N	t	0.00	0.00	2026-04-01 16:32:33.898681	0.00	0.00	0.00	0.00
20	1	9	5101	Salaries & Wages	expense	\N	debit	\N	f	0.00	0.00	2026-04-01 16:32:33.898681	0.00	0.00	0.00	0.00
21	1	9	5102	Rent	expense	\N	debit	\N	f	0.00	0.00	2026-04-01 16:32:33.898681	0.00	0.00	0.00	0.00
22	1	9	5107	Professional Fees	expense	\N	debit	\N	f	0.00	0.00	2026-04-01 16:32:33.898681	0.00	0.00	0.00	0.00
23	1	9	5108	Bank Charges	expense	\N	debit	\N	f	0.00	0.00	2026-04-01 16:32:33.898681	0.00	0.00	0.00	0.00
24	1	9	5112	Misc Expense	expense	\N	debit	\N	f	0.00	0.00	2026-04-01 16:32:33.898681	0.00	0.00	0.00	0.00
27	2	10	1003	Accounts Receivable	asset	\N	debit	\N	t	0.00	0.00	2026-04-01 16:32:33.907161	0.00	0.00	0.00	0.00
28	2	10	1004	Input GST (CGST)	asset	\N	debit	\N	t	0.00	0.00	2026-04-01 16:32:33.907161	0.00	0.00	0.00	0.00
29	2	10	1005	Input GST (SGST)	asset	\N	debit	\N	t	0.00	0.00	2026-04-01 16:32:33.907161	0.00	0.00	0.00	0.00
30	2	10	1006	Input GST (IGST)	asset	\N	debit	\N	t	0.00	0.00	2026-04-01 16:32:33.907161	0.00	0.00	0.00	0.00
31	2	12	2001	Accounts Payable	liability	\N	credit	\N	t	0.00	0.00	2026-04-01 16:32:33.907161	0.00	0.00	0.00	0.00
32	2	12	2002	Output GST (CGST)	liability	\N	credit	\N	t	0.00	0.00	2026-04-01 16:32:33.907161	0.00	0.00	0.00	0.00
33	2	12	2003	Output GST (SGST)	liability	\N	credit	\N	t	0.00	0.00	2026-04-01 16:32:33.907161	0.00	0.00	0.00	0.00
34	2	12	2004	Output GST (IGST)	liability	\N	credit	\N	t	0.00	0.00	2026-04-01 16:32:33.907161	0.00	0.00	0.00	0.00
35	2	12	2005	TDS Payable	liability	\N	credit	\N	t	0.00	0.00	2026-04-01 16:32:33.907161	0.00	0.00	0.00	0.00
37	2	15	4001	Sales Revenue	revenue	\N	credit	\N	t	0.00	0.00	2026-04-01 16:32:33.907161	0.00	0.00	0.00	0.00
38	2	15	4002	Service Revenue	revenue	\N	credit	\N	t	0.00	0.00	2026-04-01 16:32:33.907161	0.00	0.00	0.00	0.00
39	2	17	5001	Purchases	expense	\N	debit	\N	t	0.00	0.00	2026-04-01 16:32:33.907161	0.00	0.00	0.00	0.00
40	2	18	5101	Salaries & Wages	expense	\N	debit	\N	f	0.00	0.00	2026-04-01 16:32:33.907161	0.00	0.00	0.00	0.00
41	2	18	5107	Professional Fees	expense	\N	debit	\N	f	0.00	0.00	2026-04-01 16:32:33.907161	0.00	0.00	0.00	0.00
1	1	1	1001	Cash in Hand	asset	\N	debit	\N	t	50000.00	0.00	2026-04-01 16:32:33.898681	0.00	0.00	50000.00	0.00
15	1	5	3002	Retained Earnings	equity	\N	credit	\N	t	0.00	0.00	2026-04-01 16:32:33.898681	0.00	0.00	0.00	0.00
2	1	1	1002	Bank Account	asset	\N	debit	\N	t	250000.00	0.00	2026-04-01 16:32:33.898681	0.00	0.00	250000.00	0.00
8	1	2	1101	Computer Equipment	asset	\N	debit	\N	f	80000.00	0.00	2026-04-01 16:32:33.898681	0.00	0.00	80000.00	0.00
25	2	10	1001	Cash in Hand	asset	\N	debit	\N	t	30000.00	0.00	2026-04-01 16:32:33.907161	0.00	0.00	30000.00	0.00
26	2	10	1002	Bank Account	asset	\N	debit	\N	t	150000.00	0.00	2026-04-01 16:32:33.907161	0.00	0.00	150000.00	0.00
14	1	5	3001	Share Capital	equity	\N	credit	\N	t	380000.00	0.00	2026-04-01 16:32:33.898681	0.00	0.00	0.00	380000.00
36	2	14	3001	Share Capital	equity	\N	credit	\N	t	180000.00	0.00	2026-04-01 16:32:33.907161	0.00	0.00	0.00	180000.00
90	6	28	1001	Cash in Hand	asset	\N	debit	\N	t	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
91	6	28	1002	Bank Account	asset	\N	debit	\N	t	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
92	6	28	1003	Accounts Receivable	asset	\N	debit	\N	t	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
93	6	28	1004	Input GST (CGST)	asset	\N	debit	\N	t	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
94	6	28	1005	Input GST (SGST)	asset	\N	debit	\N	t	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
95	6	28	1006	Input GST (IGST)	asset	\N	debit	\N	t	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
96	6	28	1007	TDS Receivable	asset	\N	debit	\N	f	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
97	6	28	1008	Advance to Suppliers	asset	\N	debit	\N	f	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
98	6	28	1009	Prepaid Expenses	asset	\N	debit	\N	f	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
99	6	28	1010	Stock / Inventory	asset	\N	debit	\N	f	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
100	6	29	1101	Plant & Machinery	asset	\N	debit	\N	f	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
101	6	29	1102	Furniture & Fixtures	asset	\N	debit	\N	f	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
102	6	29	1103	Computer Equipment	asset	\N	debit	\N	f	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
103	6	29	1104	Land & Building	asset	\N	debit	\N	f	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
104	6	30	2001	Accounts Payable	liability	\N	credit	\N	t	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
105	6	30	2002	Output GST (CGST)	liability	\N	credit	\N	t	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
106	6	30	2003	Output GST (SGST)	liability	\N	credit	\N	t	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
107	6	30	2004	Output GST (IGST)	liability	\N	credit	\N	t	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
108	6	30	2005	TDS Payable	liability	\N	credit	\N	t	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
109	6	30	2006	Advance from Customers	liability	\N	credit	\N	f	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
110	6	30	2007	Salary Payable	liability	\N	credit	\N	f	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
111	6	30	2008	PF Payable	liability	\N	credit	\N	f	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
112	6	31	2101	Bank Loan	liability	\N	credit	\N	f	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
113	6	31	2102	Directors Loan	liability	\N	credit	\N	f	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
114	6	32	3001	Share Capital	equity	\N	credit	\N	t	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
115	6	32	3002	Retained Earnings	equity	\N	credit	\N	t	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
116	6	32	3003	Current Year Profit / Loss	equity	\N	credit	\N	t	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
117	6	33	4001	Sales Revenue	revenue	\N	credit	\N	t	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
118	6	33	4002	Service Revenue	revenue	\N	credit	\N	t	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
119	6	33	4003	Sales Returns	revenue	\N	debit	\N	f	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
120	6	34	4101	Interest Income	revenue	\N	credit	\N	f	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
121	6	34	4102	Discount Received	revenue	\N	credit	\N	f	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
122	6	34	4103	Other Income	revenue	\N	credit	\N	f	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
123	6	35	5001	Purchases	expense	\N	debit	\N	t	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
124	6	35	5002	Purchase Returns	expense	\N	credit	\N	f	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
125	6	35	5003	Direct Labour	expense	\N	debit	\N	f	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
126	6	36	5101	Salaries & Wages	expense	\N	debit	\N	f	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
127	6	36	5102	Rent	expense	\N	debit	\N	f	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
128	6	36	5103	Electricity	expense	\N	debit	\N	f	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
129	6	36	5104	Internet & Phone	expense	\N	debit	\N	f	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
130	6	36	5105	Office Supplies	expense	\N	debit	\N	f	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
131	6	36	5106	Travel & Conveyance	expense	\N	debit	\N	f	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
132	6	36	5107	Professional Fees	expense	\N	debit	\N	f	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
133	6	36	5108	Bank Charges	expense	\N	debit	\N	f	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
134	6	36	5109	Depreciation	expense	\N	debit	\N	f	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
135	6	36	5110	Interest on Loan	expense	\N	debit	\N	f	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
136	6	36	5111	GST Late Fee	expense	\N	debit	\N	f	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
137	6	36	5112	Miscellaneous Expense	expense	\N	debit	\N	f	0.00	0.00	2026-04-03 20:21:13.789862	0.00	0.00	0.00	0.00
138	7	37	1001	Cash in Hand	asset	\N	debit	\N	t	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
139	7	37	1002	Bank Account	asset	\N	debit	\N	t	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
140	7	37	1003	Accounts Receivable	asset	\N	debit	\N	t	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
141	7	37	1004	Input GST (CGST)	asset	\N	debit	\N	t	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
142	7	37	1005	Input GST (SGST)	asset	\N	debit	\N	t	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
143	7	37	1006	Input GST (IGST)	asset	\N	debit	\N	t	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
144	7	37	1007	TDS Receivable	asset	\N	debit	\N	f	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
145	7	37	1008	Advance to Suppliers	asset	\N	debit	\N	f	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
146	7	37	1009	Prepaid Expenses	asset	\N	debit	\N	f	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
147	7	37	1010	Stock / Inventory	asset	\N	debit	\N	f	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
148	7	38	1101	Plant & Machinery	asset	\N	debit	\N	f	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
149	7	38	1102	Furniture & Fixtures	asset	\N	debit	\N	f	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
150	7	38	1103	Computer Equipment	asset	\N	debit	\N	f	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
151	7	38	1104	Land & Building	asset	\N	debit	\N	f	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
152	7	39	2001	Accounts Payable	liability	\N	credit	\N	t	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
153	7	39	2002	Output GST (CGST)	liability	\N	credit	\N	t	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
154	7	39	2003	Output GST (SGST)	liability	\N	credit	\N	t	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
155	7	39	2004	Output GST (IGST)	liability	\N	credit	\N	t	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
156	7	39	2005	TDS Payable	liability	\N	credit	\N	t	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
157	7	39	2006	Advance from Customers	liability	\N	credit	\N	f	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
158	7	39	2007	Salary Payable	liability	\N	credit	\N	f	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
159	7	39	2008	PF Payable	liability	\N	credit	\N	f	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
160	7	40	2101	Bank Loan	liability	\N	credit	\N	f	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
161	7	40	2102	Directors Loan	liability	\N	credit	\N	f	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
162	7	41	3001	Share Capital	equity	\N	credit	\N	t	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
163	7	41	3002	Retained Earnings	equity	\N	credit	\N	t	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
164	7	41	3003	Current Year Profit / Loss	equity	\N	credit	\N	t	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
165	7	42	4001	Sales Revenue	revenue	\N	credit	\N	t	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
166	7	42	4002	Service Revenue	revenue	\N	credit	\N	t	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
167	7	42	4003	Sales Returns	revenue	\N	debit	\N	f	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
168	7	43	4101	Interest Income	revenue	\N	credit	\N	f	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
169	7	43	4102	Discount Received	revenue	\N	credit	\N	f	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
170	7	43	4103	Other Income	revenue	\N	credit	\N	f	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
171	7	44	5001	Purchases	expense	\N	debit	\N	t	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
172	7	44	5002	Purchase Returns	expense	\N	credit	\N	f	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
173	7	44	5003	Direct Labour	expense	\N	debit	\N	f	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
174	7	45	5101	Salaries & Wages	expense	\N	debit	\N	f	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
175	7	45	5102	Rent	expense	\N	debit	\N	f	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
176	7	45	5103	Electricity	expense	\N	debit	\N	f	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
177	7	45	5104	Internet & Phone	expense	\N	debit	\N	f	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
178	7	45	5105	Office Supplies	expense	\N	debit	\N	f	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
179	7	45	5106	Travel & Conveyance	expense	\N	debit	\N	f	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
180	7	45	5107	Professional Fees	expense	\N	debit	\N	f	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
181	7	45	5108	Bank Charges	expense	\N	debit	\N	f	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
182	7	45	5109	Depreciation	expense	\N	debit	\N	f	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
183	7	45	5110	Interest on Loan	expense	\N	debit	\N	f	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
184	7	45	5111	GST Late Fee	expense	\N	debit	\N	f	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
185	7	45	5112	Miscellaneous Expense	expense	\N	debit	\N	f	0.00	0.00	2026-04-04 14:07:59.09287	0.00	0.00	0.00	0.00
186	1	3	2009	ESIC Payable	liability	\N	credit	\N	f	0.00	0.00	2026-04-06 14:20:54.331746	0.00	0.00	0.00	0.00
187	2	12	2009	ESIC Payable	liability	\N	credit	\N	f	0.00	0.00	2026-04-06 14:20:54.331746	0.00	0.00	0.00	0.00
188	6	30	2009	ESIC Payable	liability	\N	credit	\N	f	0.00	0.00	2026-04-06 14:20:54.331746	0.00	0.00	0.00	0.00
189	7	39	2009	ESIC Payable	liability	\N	credit	\N	f	0.00	0.00	2026-04-06 14:20:54.331746	0.00	0.00	0.00	0.00
\.


--
-- Data for Name: audit_log; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.audit_log (id, company_id, user_id, action, table_name, record_id, old_values, new_values, ip_address, created_at) FROM stdin;
1	2	1	AI_DOCUMENT_INGESTED	invoices	20	\N	{"amount": 5712, "vendor": "Unknown Party", "pipeline": ["invoice_created", "journal_entry_created", "itc_recorded", "compliance_deadline_added"], "file_name": "gst_invoice_sample.pdf"}	\N	2026-04-03 12:54:17.716537
2	2	1	INVOICE_CANCELLED	invoices	20	\N	{"party": "Unknown Party", "amount": "5712.00", "invoice_number": "GST-INV-1001"}	\N	2026-04-03 16:01:50.452809
15	6	1	AI_DOCUMENT_INGESTED	invoices	26	\N	{"amount": 182192, "vendor": "Raw Materials Co", "pipeline": ["invoice_created", "journal_entry_created", "itc_recorded", "compliance_deadline_added"], "file_name": "FinLex_Test_Invoices.pdf"}	\N	2026-04-03 20:29:17.997062
16	6	1	INVOICE_CANCELLED	invoices	30	\N	{"party": "Mumbai Infra Corp", "amount": "271400.00", "invoice_number": "SAL-2024-002"}	\N	2026-04-03 21:21:21.470872
17	1	1	AI_DOCUMENT_INGESTED	invoices	41	\N	{"amount": 271400, "vendor": "FinLex Demo Pvt Ltd", "pipeline": ["invoice_created", "journal_entry_created", "compliance_deadline_added"], "file_name": "FinLex_Test_Invoices.pdf [Page 2/4]"}	\N	2026-04-04 10:19:01.585732
18	1	1	AI_DOCUMENT_INGESTED	invoices	42	\N	{"amount": 175000, "vendor": "FinLex Demo Pvt Ltd", "pipeline": ["invoice_created", "journal_entry_created", "itc_recorded", "compliance_deadline_added"], "file_name": "FinLex_Test_Invoices.pdf [Page 4/4]"}	\N	2026-04-04 10:19:01.633058
19	7	1	AI_DOCUMENT_INGESTED	invoices	43	\N	{"amount": 39648, "vendor": "Amazon Web Services India Private Limited", "pipeline": ["invoice_created", "journal_entry_created", "itc_recorded", "compliance_deadline_added"], "file_name": "01_AWS_Cloud_Services_Nov2024.pdf"}	\N	2026-04-04 14:27:05.366653
20	7	1	AI_DOCUMENT_INGESTED	invoices	44	\N	{"amount": 80240, "vendor": "Rajesh Kumar (Freelance Software Developer)", "pipeline": ["invoice_created", "journal_entry_created", "itc_recorded", "compliance_deadline_added", "tds_auto_deducted"], "file_name": "02_Rajesh_Kumar_Dev_Oct2024.pdf"}	\N	2026-04-04 14:27:49.719359
21	7	1	AI_DOCUMENT_INGESTED	invoices	45	\N	{"amount": 74340, "vendor": "Prestige Property Management LLP", "pipeline": ["invoice_created", "journal_entry_created", "itc_recorded", "tds_auto_deducted"], "file_name": "03_Prestige_Office_Rent_Nov2024.pdf"}	\N	2026-04-04 14:28:12.641211
22	7	1	AI_DOCUMENT_INGESTED	invoices	46	\N	{"amount": 1941100, "vendor": "TechNova Solutions Private Limited", "pipeline": ["invoice_created", "journal_entry_created", "itc_recorded"], "file_name": "04_TechNova_Sale_Growfast_Oct2024.pdf"}	\N	2026-04-04 14:28:28.628785
23	7	1	AI_DOCUMENT_INGESTED	invoices	47	\N	{"amount": 64900, "vendor": "LegalEdge Associates (Advocates & Solicitors)", "pipeline": ["invoice_created", "journal_entry_created", "itc_recorded"], "file_name": "05_LegalEdge_Legal_Services_Oct2024.pdf"}	\N	2026-04-04 14:28:46.436978
24	7	1	INVOICE_CANCELLED	invoices	46	\N	{"party": "TechNova Solutions Private Limited", "amount": "1941100.00", "invoice_number": "TNS-2024-10-0156"}	\N	2026-04-04 14:32:12.765871
25	7	1	INVOICE_CANCELLED	invoices	43	\N	{"party": "Amazon Web Services India Private Limited", "amount": "39648.00", "invoice_number": "AWS-IN-2024-11-08291"}	\N	2026-04-04 19:59:47.706588
26	7	1	INVOICE_CANCELLED	invoices	45	\N	{"party": "Prestige Property Management LLP", "amount": "74340.00", "invoice_number": "PPM-RENT-NOV24-0089"}	\N	2026-04-04 19:59:50.406512
27	7	1	INVOICE_CANCELLED	invoices	44	\N	{"party": "Rajesh Kumar (Freelance Software Developer)", "amount": "80240.00", "invoice_number": "RK-INV-2024-047"}	\N	2026-04-04 19:59:53.074446
28	7	1	INVOICE_CANCELLED	invoices	47	\N	{"party": "LegalEdge Associates (Advocates & Solicitors)", "amount": "64900.00", "invoice_number": "LE-2024-10-0312"}	\N	2026-04-04 19:59:56.458465
29	7	1	INVOICE_CANCELLED	invoices	49	\N	{"party": "Growfast Ecommerce Private Limited", "amount": "194110000.00", "invoice_number": "TNS-2024-10-0156-R"}	\N	2026-04-04 20:00:00.195772
30	7	1	AI_DOCUMENT_INGESTED	invoices	50	\N	{"amount": 39648, "vendor": "Amazon Web Services India Private Limited", "pipeline": ["invoice_created", "journal_entry_created", "itc_recorded"], "file_name": "01_AWS_Cloud_Services_Nov2024.pdf"}	\N	2026-04-04 20:02:24.271649
31	7	1	AI_DOCUMENT_INGESTED	invoices	51	\N	{"amount": 80240, "vendor": "Rajesh Kumar (Freelance Software Developer)", "pipeline": ["invoice_created", "journal_entry_created", "itc_recorded", "tds_auto_deducted"], "file_name": "02_Rajesh_Kumar_Dev_Oct2024.pdf"}	\N	2026-04-04 20:03:23.231443
32	7	1	AI_DOCUMENT_INGESTED	invoices	52	\N	{"amount": 39648, "vendor": "Amazon Web Services India Private Limited", "pipeline": ["invoice_created", "journal_entry_created", "itc_recorded"], "file_name": "01_AWS_Cloud_Services_Nov2024.pdf"}	\N	2026-04-04 20:25:30.06627
33	7	1	AI_DOCUMENT_INGESTED	invoices	53	\N	{"amount": 80240, "vendor": "Rajesh Kumar (Freelance Software Developer)", "pipeline": ["invoice_created", "journal_entry_created", "itc_recorded", "tds_auto_deducted"], "file_name": "02_Rajesh_Kumar_Dev_Oct2024.pdf"}	\N	2026-04-04 20:25:39.60068
34	7	1	AI_DOCUMENT_INGESTED	invoices	54	\N	{"amount": 74340, "vendor": "Prestige Property Management LLP", "pipeline": ["invoice_created", "journal_entry_created", "itc_recorded", "tds_auto_deducted"], "file_name": "03_Prestige_Office_Rent_Nov2024.pdf"}	\N	2026-04-04 20:25:46.728495
35	7	1	AI_DOCUMENT_INGESTED	invoices	55	\N	{"amount": 1941100, "vendor": "TechNova Solutions Private Limited", "pipeline": ["invoice_created", "journal_entry_created", "itc_recorded"], "file_name": "04_TechNova_Sale_Growfast_Oct2024.pdf"}	\N	2026-04-04 20:25:53.48838
36	7	1	AI_DOCUMENT_INGESTED	invoices	56	\N	{"amount": 64900, "vendor": "LegalEdge Associates (Advocates & Solicitors)", "pipeline": ["invoice_created", "journal_entry_created", "itc_recorded"], "file_name": "05_LegalEdge_Legal_Services_Oct2024.pdf"}	\N	2026-04-04 20:26:05.205663
\.


--
-- Data for Name: bank_statements; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.bank_statements (id, company_id, account_id, statement_date, description, debit_amount, credit_amount, balance, reference, matched, matched_je_id, created_at) FROM stdin;
\.


--
-- Data for Name: ca_company_access; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ca_company_access (id, ca_id, company_id, role, created_at) FROM stdin;
1	1	1	owner	2026-04-01 16:32:33.883216
2	1	2	owner	2026-04-01 16:32:33.883216
6	1	6	owner	2026-04-03 20:21:13.789862
7	1	7	owner	2026-04-04 14:07:59.09287
\.


--
-- Data for Name: client_tasks; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.client_tasks (id, ca_id, company_id, title, description, priority, status, due_date, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: companies; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.companies (id, name, gstin, pan, state_code, state_name, financial_year, fy_start_date, fy_end_date, address, phone, email, business_type, gst_registered, created_by, created_at, updated_at, tan, closing_entries_posted, closing_entries_date) FROM stdin;
1	Rahul Exports Pvt Ltd	27AABCR1234A1Z5	AABCR1234A	27	Maharashtra	2024-25	2024-04-01	2025-03-31	123 MG Road, Mumbai, Maharashtra 400001	9876543210	rahul@rahulexports.com	private_limited	t	1	2026-04-01 16:32:33.878247	2026-04-01 16:32:33.878247	\N	f	\N
2	Kerala Spices Traders	32AADCK5678B1Z3	AADCK5678B	32	Kerala	2024-25	2024-04-01	2025-03-31	45 Spice Market, Kozhikode, Kerala 673001	9845123456	info@keralaspices.com	proprietorship	t	1	2026-04-01 16:32:33.878247	2026-04-01 16:32:33.878247	\N	f	\N
6	Hyderabad Electronics Pvt Ltd	36AAAAA5678B1Z	AAAAA5678B	36	Telangana	2024-25	2024-01-01	2025-12-31	\N	\N	\N	private_limited	t	1	2026-04-03 20:21:13.789862	2026-04-03 20:21:13.789862	\N	f	\N
7	TechNova Solutions Private Limited	29AABCT1234F1ZP	AABCT1234F	29	Karnataka	2024-25	2024-04-01	2025-03-31	\N	\N	\N	private_limited	t	1	2026-04-04 14:07:59.09287	2026-04-04 14:07:59.09287	\N	f	\N
\.


--
-- Data for Name: compliance_deadlines; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.compliance_deadlines (id, company_id, type, name, due_date, financial_year, period, status, notes, created_at) FROM stdin;
1	1	GST	GSTR-1 Filing (Apr 2024)	2024-05-11	2024-25	\N	completed	\N	2026-04-01 16:32:33.914528
2	1	GST	GSTR-3B Filing (Apr 2024)	2024-05-20	2024-25	\N	completed	\N	2026-04-01 16:32:33.914528
3	1	GST	GSTR-1 Filing (May 2024)	2024-06-11	2024-25	\N	completed	\N	2026-04-01 16:32:33.914528
4	1	GST	GSTR-3B Filing (May 2024)	2024-06-20	2024-25	\N	completed	\N	2026-04-01 16:32:33.914528
5	1	GST	GSTR-1 Filing (Jun 2024)	2024-07-11	2024-25	\N	completed	\N	2026-04-01 16:32:33.914528
6	1	GST	GSTR-3B Filing (Jun 2024)	2024-07-20	2024-25	\N	completed	\N	2026-04-01 16:32:33.914528
7	1	TDS	TDS Return Q1 (Apr-Jun 2024)	2024-07-31	2024-25	\N	completed	\N	2026-04-01 16:32:33.914528
8	1	ADVANCE_TAX	Advance Tax Q1	2024-06-15	2024-25	\N	completed	\N	2026-04-01 16:32:33.914528
9	1	ADVANCE_TAX	Advance Tax Q2	2024-09-15	2024-25	\N	completed	\N	2026-04-01 16:32:33.914528
10	1	TDS	TDS Return Q2 (Jul-Sep 2024)	2024-10-31	2024-25	\N	completed	\N	2026-04-01 16:32:33.914528
11	1	ADVANCE_TAX	Advance Tax Q3	2024-12-15	2024-25	\N	completed	\N	2026-04-01 16:32:33.914528
12	1	TDS	TDS Return Q3 (Oct-Dec 2024)	2025-01-31	2024-25	\N	pending	\N	2026-04-01 16:32:33.914528
13	1	GST	GSTR-1 Filing (Jan 2025)	2025-02-11	2024-25	\N	pending	\N	2026-04-01 16:32:33.914528
14	1	GST	GSTR-3B Filing (Jan 2025)	2025-02-20	2024-25	\N	pending	\N	2026-04-01 16:32:33.914528
15	1	GST	GSTR-1 Filing (Feb 2025)	2025-03-11	2024-25	\N	pending	\N	2026-04-01 16:32:33.914528
16	1	GST	GSTR-3B Filing (Feb 2025)	2025-03-20	2024-25	\N	pending	\N	2026-04-01 16:32:33.914528
17	1	ADVANCE_TAX	Advance Tax Q4	2025-03-15	2024-25	\N	pending	\N	2026-04-01 16:32:33.914528
18	1	TDS	TDS Return Q4 (Jan-Mar 2025)	2025-05-31	2024-25	\N	pending	\N	2026-04-01 16:32:33.914528
19	1	ITR	ITR Filing FY 2024-25	2025-07-31	2024-25	\N	pending	\N	2026-04-01 16:32:33.914528
20	1	ROC	ROC Annual Return	2025-09-30	2024-25	\N	pending	\N	2026-04-01 16:32:33.914528
21	2	GST	GSTR-1 Filing (Apr 2024)	2024-05-11	2024-25	\N	completed	\N	2026-04-01 16:32:33.923693
22	2	GST	GSTR-3B Filing (Apr 2024)	2024-05-20	2024-25	\N	completed	\N	2026-04-01 16:32:33.923693
23	2	TDS	TDS Return Q1	2024-07-31	2024-25	\N	completed	\N	2026-04-01 16:32:33.923693
27	2	GST	GSTR-3B Filing	2026-05-19	2026-2027	April 2026	pending	\N	2026-04-03 12:54:17.716537
48	6	GST	GSTR-1 Filing (Apr)	2024-05-11	2024-25	\N	pending	\N	2026-04-03 20:21:13.789862
49	6	GST	GSTR-3B Filing (Apr)	2024-05-20	2024-25	\N	pending	\N	2026-04-03 20:21:13.789862
50	6	GST	GSTR-1 Filing (May)	2024-06-11	2024-25	\N	pending	\N	2026-04-03 20:21:13.789862
51	6	GST	GSTR-3B Filing (May)	2024-06-20	2024-25	\N	pending	\N	2026-04-03 20:21:13.789862
52	6	GST	GSTR-1 Filing (Jun)	2024-07-11	2024-25	\N	pending	\N	2026-04-03 20:21:13.789862
53	6	GST	GSTR-3B Filing (Jun)	2024-07-20	2024-25	\N	pending	\N	2026-04-03 20:21:13.789862
54	6	TDS	TDS Return Q1	2024-07-31	2024-25	\N	pending	\N	2026-04-03 20:21:13.789862
55	6	GST	GSTR-1 Filing (Jul)	2024-08-11	2024-25	\N	pending	\N	2026-04-03 20:21:13.789862
56	6	GST	GSTR-3B Filing (Jul)	2024-08-20	2024-25	\N	pending	\N	2026-04-03 20:21:13.789862
57	6	ADVANCE_TAX	Advance Tax Q1	2024-06-15	2024-25	\N	pending	\N	2026-04-03 20:21:13.789862
58	6	ADVANCE_TAX	Advance Tax Q2	2024-09-15	2024-25	\N	pending	\N	2026-04-03 20:21:13.789862
59	6	TDS	TDS Return Q2	2024-10-31	2024-25	\N	pending	\N	2026-04-03 20:21:13.789862
60	6	ADVANCE_TAX	Advance Tax Q3	2024-12-15	2024-25	\N	pending	\N	2026-04-03 20:21:13.789862
61	6	TDS	TDS Return Q3	2025-01-31	2024-25	\N	pending	\N	2026-04-03 20:21:13.789862
62	6	ADVANCE_TAX	Advance Tax Q4	2025-03-15	2024-25	\N	pending	\N	2026-04-03 20:21:13.789862
63	6	TDS	TDS Return Q4	2025-05-31	2024-25	\N	pending	\N	2026-04-03 20:21:13.789862
64	6	ITR	ITR Filing FY 2024-25	2025-07-31	2024-25	\N	pending	\N	2026-04-03 20:21:13.789862
65	6	ROC	ROC Annual Return	2025-09-30	2024-25	\N	pending	\N	2026-04-03 20:21:13.789862
66	6	GST	GSTR-3B Filing	2024-05-19	2024-2025	April 2024	pending	\N	2026-04-03 20:29:17.997062
67	1	GST	GSTR-3B Filing	2024-07-19	2024-2025	June 2024	pending	\N	2026-04-04 10:19:01.585732
68	1	GST	GSTR-3B Filing	2024-11-19	2024-2025	October 2024	pending	\N	2026-04-04 10:19:01.633058
70	7	GST	GSTR-3B Filing (Apr)	2024-05-20	2024-25	\N	pending	\N	2026-04-04 14:07:59.09287
71	7	GST	GSTR-1 Filing (May)	2024-06-11	2024-25	\N	pending	\N	2026-04-04 14:07:59.09287
72	7	GST	GSTR-3B Filing (May)	2024-06-20	2024-25	\N	pending	\N	2026-04-04 14:07:59.09287
73	7	GST	GSTR-1 Filing (Jun)	2024-07-11	2024-25	\N	pending	\N	2026-04-04 14:07:59.09287
74	7	GST	GSTR-3B Filing (Jun)	2024-07-20	2024-25	\N	pending	\N	2026-04-04 14:07:59.09287
75	7	TDS	TDS Return Q1	2024-07-31	2024-25	\N	pending	\N	2026-04-04 14:07:59.09287
76	7	GST	GSTR-1 Filing (Jul)	2024-08-11	2024-25	\N	pending	\N	2026-04-04 14:07:59.09287
77	7	GST	GSTR-3B Filing (Jul)	2024-08-20	2024-25	\N	pending	\N	2026-04-04 14:07:59.09287
78	7	ADVANCE_TAX	Advance Tax Q1	2024-06-15	2024-25	\N	pending	\N	2026-04-04 14:07:59.09287
79	7	ADVANCE_TAX	Advance Tax Q2	2024-09-15	2024-25	\N	pending	\N	2026-04-04 14:07:59.09287
80	7	TDS	TDS Return Q2	2024-10-31	2024-25	\N	pending	\N	2026-04-04 14:07:59.09287
69	7	GST	GSTR-1 Filing (Apr)	2024-05-11	2024-25	\N	completed	Marked complete	2026-04-04 14:07:59.09287
24	2	GST	GSTR-1 Filing (Jan 2025)	2025-02-11	2024-25	\N	completed	Marked complete	2026-04-01 16:32:33.923693
25	2	GST	GSTR-3B Filing (Jan 2025)	2025-02-20	2024-25	\N	completed	Marked complete	2026-04-01 16:32:33.923693
26	2	ITR	ITR Filing FY 2024-25	2025-07-31	2024-25	\N	completed	Marked complete	2026-04-01 16:32:33.923693
81	7	ADVANCE_TAX	Advance Tax Q3	2024-12-15	2024-25	\N	pending	\N	2026-04-04 14:07:59.09287
82	7	TDS	TDS Return Q3	2025-01-31	2024-25	\N	pending	\N	2026-04-04 14:07:59.09287
83	7	ADVANCE_TAX	Advance Tax Q4	2025-03-15	2024-25	\N	pending	\N	2026-04-04 14:07:59.09287
84	7	TDS	TDS Return Q4	2025-05-31	2024-25	\N	pending	\N	2026-04-04 14:07:59.09287
85	7	ITR	ITR Filing FY 2024-25	2025-07-31	2024-25	\N	pending	\N	2026-04-04 14:07:59.09287
86	7	ROC	ROC Annual Return	2025-09-30	2024-25	\N	pending	\N	2026-04-04 14:07:59.09287
87	7	GST	GSTR-3B Filing	2024-12-19	2024-2025	November 2024	pending	\N	2026-04-04 14:27:05.366653
88	7	GST	GSTR-3B Filing	2024-11-19	2024-2025	October 2024	pending	\N	2026-04-04 14:27:49.719359
\.


--
-- Data for Name: credit_debit_note_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.credit_debit_note_items (id, note_id, description, hsn_sac_code, quantity, unit, rate, taxable_amount, gst_rate, cgst_amount, sgst_amount, igst_amount, total_amount) FROM stdin;
\.


--
-- Data for Name: credit_debit_notes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.credit_debit_notes (id, company_id, note_type, note_number, note_date, original_invoice_id, original_invoice_number, party_name, party_gstin, party_state, reason, subtotal, taxable_amount, cgst_amount, sgst_amount, igst_amount, total_amount, status, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: depreciation_entries; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.depreciation_entries (id, company_id, asset_id, financial_year, opening_wdv, depreciation, closing_wdv, method, journal_entry_id, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: document_requests; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.document_requests (id, ca_id, company_id, title, description, status, due_date, received_at, created_at) FROM stdin;
\.


--
-- Data for Name: financial_statement_config; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.financial_statement_config (id, company_id, account_id, statement, section, display_order, created_at) FROM stdin;
\.


--
-- Data for Name: fixed_assets; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.fixed_assets (id, company_id, asset_name, asset_code, category, purchase_date, cost_price, salvage_value, useful_life_years, method, wdv_rate, current_wdv, account_id, is_active, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: gst_rates; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.gst_rates (id, hsn_code, sac_code, description, gst_rate, cess_rate, effective_from, is_active) FROM stdin;
\.


--
-- Data for Name: gst_returns; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.gst_returns (id, company_id, return_type, period_month, period_year, status, due_date, filed_date, total_tax, igst, cgst, sgst, itc_claimed, net_payable, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: invoice_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.invoice_items (id, invoice_id, description, hsn_sac_code, quantity, unit, rate, taxable_amount, gst_rate, cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount, total_amount, account_id) FROM stdin;
1	1	Software Development Services	998314	1.000	NOS	100000.00	100000.00	18.00	9.00	9.00	0.00	9000.00	9000.00	0.00	118000.00	\N
2	2	Electronic Components	8542	100.000	PCS	500.00	50000.00	18.00	9.00	9.00	0.00	4500.00	4500.00	0.00	59000.00	\N
3	3	Hardware Goods	8471	50.000	PCS	1500.00	75000.00	18.00	9.00	9.00	0.00	6750.00	6750.00	0.00	88500.00	\N
4	4	Export Goods — Spices	0910	200.000	KG	1000.00	200000.00	18.00	0.00	0.00	18.00	0.00	0.00	36000.00	236000.00	\N
5	5	IT Consulting Services	998313	1.000	NOS	150000.00	150000.00	18.00	0.00	0.00	18.00	0.00	0.00	27000.00	177000.00	\N
6	6	Business Consulting	998311	1.000	NOS	80000.00	80000.00	18.00	0.00	0.00	18.00	0.00	0.00	14400.00	94400.00	\N
7	7	Software License	998315	1.000	NOS	120000.00	120000.00	18.00	9.00	9.00	0.00	10800.00	10800.00	0.00	141600.00	\N
8	8	Electronic Products	8542	150.000	PCS	600.00	90000.00	18.00	9.00	9.00	0.00	8100.00	8100.00	0.00	106200.00	\N
9	9	Textile Goods	5208	100.000	MTR	600.00	60000.00	18.00	0.00	0.00	18.00	0.00	0.00	10800.00	70800.00	\N
10	10	Hardware Supply	8471	80.000	PCS	1375.00	110000.00	18.00	9.00	9.00	0.00	9900.00	9900.00	0.00	129800.00	\N
11	11	Raw Materials — Steel	7208	20.000	KG	2000.00	40000.00	18.00	9.00	9.00	0.00	3600.00	3600.00	0.00	47200.00	\N
12	12	Office Stationery	4820	1.000	LOT	15000.00	15000.00	18.00	9.00	9.00	0.00	1350.00	1350.00	0.00	17700.00	\N
13	13	Electronic Components	8542	100.000	PCS	800.00	80000.00	18.00	0.00	0.00	18.00	0.00	0.00	14400.00	94400.00	\N
14	14	Raw Materials — Copper	7408	25.000	KG	2200.00	55000.00	18.00	9.00	9.00	0.00	4950.00	4950.00	0.00	64900.00	\N
15	15	Computer Equipment	8471	2.000	PCS	60000.00	120000.00	18.00	0.00	0.00	18.00	0.00	0.00	21600.00	141600.00	\N
16	16	Black Pepper Export	0904	150.000	KG	300.00	45000.00	18.00	0.00	0.00	18.00	0.00	0.00	8100.00	53100.00	\N
17	17	Cardamom Supply	0908	80.000	KG	400.00	32000.00	18.00	0.00	0.00	18.00	0.00	0.00	5760.00	37760.00	\N
18	18	Mixed Spices	0910	200.000	KG	335.00	67000.00	18.00	0.00	0.00	18.00	0.00	0.00	12060.00	79060.00	\N
19	19	Raw Spices Purchase	0910	100.000	KG	200.00	20000.00	18.00	9.00	9.00	0.00	1800.00	1800.00	0.00	23600.00	\N
20	20	Laptop Stand	8473	2.000	NOS	1500.00	3000.00	18.00	9.00	9.00	0.00	270.00	270.00	0.00	3540.00	\N
21	20	USB Keyboard	8471	1.000	NOS	1200.00	1200.00	18.00	9.00	9.00	0.00	108.00	108.00	0.00	1416.00	\N
32	26	Steel Rods (Grade A)	7213	100.000	NOS	850.00	85000.00	18.00	0.00	0.00	18.00	0.00	0.00	15300.00	100300.00	\N
33	26	Copper Wire Bundle	7408	50.000	NOS	620.00	31000.00	18.00	0.00	0.00	18.00	0.00	0.00	5580.00	36580.00	\N
34	26	Aluminium Sheets	7606	80.000	NOS	480.00	38400.00	18.00	0.00	0.00	18.00	0.00	0.00	6912.00	45312.00	\N
35	27	Fabricated Steel Components	7308	50.000	NOS	2800.00	140000.00	18.00	0.00	0.00	18.00	0.00	0.00	25200.00	165200.00	\N
36	27	Custom Metal Assembly	7326	30.000	NOS	1900.00	57000.00	18.00	0.00	0.00	18.00	0.00	0.00	10260.00	67260.00	\N
37	28	A4 Paper Reams (80gsm)	4802	50.000	NOS	420.00	21000.00	18.00	0.00	0.00	18.00	0.00	0.00	3780.00	24780.00	\N
38	28	Printer Ink Cartridges	8443	20.000	NOS	1050.00	21000.00	12.00	0.00	0.00	12.00	0.00	0.00	2520.00	23520.00	\N
39	29	ERP Software Implementation (3 months) 	998314	1.000	NOS	150000.00	150000.00	18.00	0.00	0.00	18.00	0.00	0.00	27000.00	177000.00	\N
40	30	Structural Steel Beams (I-Section)	7216	40.000	NOS	3200.00	128000.00	18.00	0.00	0.00	18.00	0.00	0.00	23040.00	151040.00	\N
41	30	Metal Roofing Sheets	7210	120.000	NOS	850.00	102000.00	18.00	0.00	0.00	18.00	0.00	0.00	18360.00	120360.00	\N
42	31	Agricultural Transport Contract (Sept)	9965	1.000	NOS	45000.00	45000.00	5.00	0.00	0.00	5.00	0.00	0.00	2250.00	47250.00	\N
43	32	Office Furniture (Chairs)	9401	10.000	NOS	650.00	6500.00	18.00	0.00	0.00	18.00	0.00	0.00	1170.00	7670.00	\N
44	32	Filing Cabinets	9403	5.000	NOS	800.00	4000.00	12.00	0.00	0.00	12.00	0.00	0.00	480.00	4480.00	\N
45	32	Whiteboards	3926	4.000	NOS	1250.00	5000.00	12.00	0.00	0.00	12.00	0.00	0.00	600.00	5600.00	\N
46	33	Custom Fabricated Gate (Residential)	7308	1.000	NOS	75000.00	75000.00	18.00	0.00	0.00	18.00	0.00	0.00	13500.00	88500.00	\N
47	34	Office Premises Rent (Oct–Dec 2024)	997212	3.000	NOS	33333.00	99999.00	18.00	0.00	0.00	18.00	0.00	0.00	17999.82	117998.82	\N
48	35	CNC Milling Machine (Used)	8457	1.000	NOS	280000.00	280000.00	18.00	0.00	0.00	18.00	0.00	0.00	50400.00	330400.00	\N
49	35	Cutting Tool Set (Carbide)	8207	10.000	NOS	4500.00	45000.00	18.00	0.00	0.00	18.00	0.00	0.00	8100.00	53100.00	\N
50	38	\tOffice Rent	9972	1.000	NOS	100000.00	100000.00	18.00	0.00	0.00	18.00	0.00	0.00	18000.00	118000.00	\N
51	41	ERP Software Implementation (3 months)	998314	1.000	NOS	150000.00	150000.00	18.00	0.00	0.00	18.00	0.00	0.00	27000.00	177000.00	\N
52	41	Structural Steel Beams (I-Section)	7216	40.000	NOS	3200.00	128000.00	18.00	0.00	0.00	18.00	0.00	0.00	23040.00	151040.00	\N
53	41	Metal Roofing Sheets	7210	120.000	NOS	850.00	102000.00	18.00	0.00	0.00	18.00	0.00	0.00	18360.00	120360.00	\N
54	42	Filing Cabinets	9403	5.000	NOS	800.00	4000.00	12.00	0.00	0.00	12.00	0.00	0.00	480.00	4480.00	\N
55	42	Whiteboards	3926	4.000	NOS	1250.00	5000.00	12.00	0.00	0.00	12.00	0.00	0.00	600.00	5600.00	\N
56	42	Custom Fabricated Gate (Residential)	7308	1.000	NOS	75000.00	75000.00	18.00	0.00	0.00	18.00	0.00	0.00	13500.00	88500.00	\N
82	52	Amazon EC2 - Compute Instances (t3.medium x 3) - October 2024	998314	1.000	NOS	18500.00	18500.00	18.00	9.00	9.00	0.00	1665.00	1665.00	0.00	21830.00	\N
83	52	Amazon S3 - Storage Service (500 GB) - October 2024	998314	1.000	NOS	4200.00	4200.00	18.00	9.00	9.00	0.00	378.00	378.00	0.00	4956.00	\N
84	52	Amazon RDS - Managed Database Service - October 2024	998314	1.000	NOS	8800.00	8800.00	18.00	9.00	9.00	0.00	792.00	792.00	0.00	10384.00	\N
85	52	AWS Data Transfer & CDN Charges - October 2024	998314	1.000	NOS	2100.00	2100.00	18.00	9.00	9.00	0.00	189.00	189.00	0.00	2478.00	\N
86	53	Backend API Development - Node.js REST APIs (October 2024)	998313	1.000	NOS	45000.00	45000.00	18.00	9.00	9.00	0.00	4050.00	4050.00	0.00	53100.00	\N
87	53	Database Design & Optimization - PostgreSQL Schema (October 2024)	998313	1.000	NOS	15000.00	15000.00	18.00	9.00	9.00	0.00	1350.00	1350.00	0.00	17700.00	\N
88	53	Code Review & Technical Documentation (October 2024)	998313	1.000	NOS	8000.00	8000.00	18.00	9.00	9.00	0.00	720.00	720.00	0.00	9440.00	\N
89	54	Office Space Rental - 1200 sq ft, Koramangala 5th Block (November 2024)	997212	1.000	NOS	55000.00	55000.00	18.00	9.00	9.00	0.00	4950.00	4950.00	0.00	64900.00	\N
90	54	Common Area Maintenance (CAM) Charges - November 2024	997212	1.000	NOS	8000.00	8000.00	18.00	9.00	9.00	0.00	720.00	720.00	0.00	9440.00	\N
91	55	Custom E-commerce Platform Development - Phase 2 (October 2024)	998313	1.000	NOS	1250000.00	1250000.00	18.00	9.00	9.00	0.00	112500.00	112500.00	0.00	1475000.00	\N
92	55	Mobile App Development - iOS & Android (October 2024)	998313	1.000	NOS	350000.00	350000.00	18.00	9.00	9.00	0.00	31500.00	31500.00	0.00	413000.00	\N
93	55	Monthly AMC & Technical Support - October 2024	998314	1.000	NOS	45000.00	45000.00	18.00	9.00	9.00	0.00	4050.00	4050.00	0.00	53100.00	\N
94	56	Drafting & Review of Software Development Agreement with Growfast Ecommerce	998211	1.000	NOS	25000.00	25000.00	18.00	9.00	9.00	0.00	2250.00	2250.00	0.00	29500.00	\N
95	56	Employee NDA & IP Assignment Agreement (Batch of 12 employees)	998211	1.000	NOS	18000.00	18000.00	18.00	9.00	9.00	0.00	1620.00	1620.00	0.00	21240.00	\N
96	56	Company Secretarial Compliance - ROC Filing Support Q2 FY25	998211	1.000	NOS	12000.00	12000.00	18.00	9.00	9.00	0.00	1080.00	1080.00	0.00	14160.00	\N
\.


--
-- Data for Name: invoices; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.invoices (id, company_id, invoice_type, invoice_number, invoice_date, due_date, party_name, party_gstin, party_address, party_state, subtotal, taxable_amount, cgst_amount, sgst_amount, igst_amount, total_amount, status, payment_status, supply_type, notes, created_at, updated_at, tds_section, tds_amount) FROM stdin;
1	1	sale	INV-2024-001	2024-04-05	2024-05-05	Tech Solutions Mumbai	27AABCT9876B1Z1	\N	27	100000.00	100000.00	9000.00	9000.00	0.00	118000.00	confirmed	paid	regular	Software services April	2026-04-01 16:32:33.928272	2026-04-01 16:32:33.928272	\N	0.00
2	1	sale	INV-2024-002	2024-05-10	2024-06-10	Pune Distributors Ltd	27AAECP4567C1Z2	\N	27	50000.00	50000.00	4500.00	4500.00	0.00	59000.00	confirmed	paid	regular	Product supply May	2026-04-01 16:32:33.928272	2026-04-01 16:32:33.928272	\N	0.00
3	1	sale	INV-2024-003	2024-06-15	2024-07-15	Mumbai Retailers Co	27AABCM7654D1Z3	\N	27	75000.00	75000.00	6750.00	6750.00	0.00	88500.00	confirmed	partial	regular	Goods June	2026-04-01 16:32:33.928272	2026-04-01 16:32:33.928272	\N	0.00
4	1	sale	INV-2024-004	2024-07-20	2024-08-20	Kerala Imports Pvt Ltd	32AABCK3456E1Z4	\N	32	200000.00	200000.00	0.00	0.00	36000.00	236000.00	confirmed	unpaid	regular	Export goods July	2026-04-01 16:32:33.928272	2026-04-01 16:32:33.928272	\N	0.00
5	1	sale	INV-2024-005	2024-08-25	2024-09-25	Bangalore Tech Corp	29AABCB8901F1Z5	\N	29	150000.00	150000.00	0.00	0.00	27000.00	177000.00	confirmed	paid	regular	IT services Aug	2026-04-01 16:32:33.928272	2026-04-01 16:32:33.928272	\N	0.00
6	1	sale	INV-2024-006	2024-09-30	2024-10-30	Delhi Enterprises	07AABCD2345G1Z6	\N	07	80000.00	80000.00	0.00	0.00	14400.00	94400.00	confirmed	unpaid	regular	Consulting Sep	2026-04-01 16:32:33.928272	2026-04-01 16:32:33.928272	\N	0.00
7	1	sale	INV-2024-007	2024-10-05	2024-11-05	Tech Solutions Mumbai	27AABCT9876B1Z1	\N	27	120000.00	120000.00	10800.00	10800.00	0.00	141600.00	confirmed	paid	regular	Software Oct	2026-04-01 16:32:33.928272	2026-04-01 16:32:33.928272	\N	0.00
8	1	sale	INV-2024-008	2024-11-10	2024-12-10	Pune Distributors Ltd	27AAECP4567C1Z2	\N	27	90000.00	90000.00	8100.00	8100.00	0.00	106200.00	confirmed	paid	regular	Products Nov	2026-04-01 16:32:33.928272	2026-04-01 16:32:33.928272	\N	0.00
9	1	sale	INV-2024-009	2024-12-15	2025-01-15	Gujarat Traders	24AABCG5678H1Z7	\N	24	60000.00	60000.00	0.00	0.00	10800.00	70800.00	confirmed	unpaid	regular	Goods Dec	2026-04-01 16:32:33.928272	2026-04-01 16:32:33.928272	\N	0.00
10	1	sale	INV-2025-001	2025-01-20	2025-02-20	Mumbai Retailers Co	27AABCM7654D1Z3	\N	27	110000.00	110000.00	9900.00	9900.00	0.00	129800.00	confirmed	unpaid	regular	Jan supply	2026-04-01 16:32:33.928272	2026-04-01 16:32:33.928272	\N	0.00
11	1	purchase	PUR-2024-001	2024-04-10	2024-05-10	Raw Materials Co	27AABCR5432I1Z8	\N	27	40000.00	40000.00	3600.00	3600.00	0.00	47200.00	confirmed	paid	regular	\N	2026-04-01 16:32:33.936207	2026-04-01 16:32:33.936207	\N	0.00
12	1	purchase	PUR-2024-002	2024-05-15	2024-06-15	Office Supplies Hub	27AABCO6789J1Z9	\N	27	15000.00	15000.00	1350.00	1350.00	0.00	17700.00	confirmed	paid	regular	\N	2026-04-01 16:32:33.936207	2026-04-01 16:32:33.936207	\N	0.00
13	1	purchase	PUR-2024-003	2024-06-20	2024-07-20	Chennai Suppliers Ltd	33AABCC9012K1Z0	\N	33	80000.00	80000.00	0.00	0.00	14400.00	94400.00	confirmed	paid	regular	\N	2026-04-01 16:32:33.936207	2026-04-01 16:32:33.936207	\N	0.00
14	1	purchase	PUR-2024-004	2024-09-10	2024-10-10	Raw Materials Co	27AABCR5432I1Z8	\N	27	55000.00	55000.00	4950.00	4950.00	0.00	64900.00	confirmed	paid	regular	\N	2026-04-01 16:32:33.936207	2026-04-01 16:32:33.936207	\N	0.00
15	1	purchase	PUR-2024-005	2024-12-05	2025-01-05	Tech Equipment Delhi	07AABCT1234L1Z1	\N	07	120000.00	120000.00	0.00	0.00	21600.00	141600.00	confirmed	unpaid	regular	\N	2026-04-01 16:32:33.936207	2026-04-01 16:32:33.936207	\N	0.00
16	2	sale	KST-2024-001	2024-04-12	2024-05-12	Mumbai Spice Importers	27AABCM1234M1Z2	\N	27	45000.00	45000.00	0.00	0.00	8100.00	53100.00	confirmed	paid	regular	\N	2026-04-01 16:32:33.941579	2026-04-01 16:32:33.941579	\N	0.00
17	2	sale	KST-2024-002	2024-07-18	2024-08-18	Bangalore Groceries	29AABCB5678N1Z3	\N	29	32000.00	32000.00	0.00	0.00	5760.00	37760.00	confirmed	paid	regular	\N	2026-04-01 16:32:33.941579	2026-04-01 16:32:33.941579	\N	0.00
18	2	sale	KST-2024-003	2024-11-22	2024-12-22	Delhi Food Corp	07AABCD9012O1Z4	\N	07	67000.00	67000.00	0.00	0.00	12060.00	79060.00	confirmed	unpaid	regular	\N	2026-04-01 16:32:33.941579	2026-04-01 16:32:33.941579	\N	0.00
19	2	purchase	KPR-2024-001	2024-04-20	2024-05-20	Spice Farm Kerala	32AABCS3456P1Z5	\N	32	20000.00	20000.00	1800.00	1800.00	0.00	23600.00	confirmed	paid	regular	\N	2026-04-01 16:32:33.941579	2026-04-01 16:32:33.941579	\N	0.00
31	6	purchase	PUR-2024-004	2024-09-10	\N	Spice Farm Kerala	32AABCS4567G1Z1	\N	32	45000.00	45000.00	0.00	0.00	2250.00	47250.00	confirmed	unpaid	regular	\N	2026-04-03 21:07:36.957471	2026-04-03 21:07:36.957471	\N	0.00
20	2	purchase	GST-INV-1001	2026-04-01	\N	Unknown Party	29ABCDE1234F1Z5	\N	32	4200.00	4200.00	756.00	756.00	0.00	5712.00	cancelled	unpaid	regular	Auto-ingested from: gst_invoice_sample.pdf	2026-04-03 12:54:17.716537	2026-04-03 16:01:50.452809	\N	0.00
32	6	purchase	PUR-2024-005	2024-09-25	\N	Multi Supply Traders	32AABCM6789H1Z9	\N	32	15500.00	15500.00	0.00	0.00	2250.00	17750.00	confirmed	unpaid	regular	\N	2026-04-03 21:11:34.334315	2026-04-03 21:11:34.334315	\N	0.00
33	6	sale	SAL-2024-003	2024-10-05	\N	Walk-in Customer (B2C)	URP	\N	32	75000.00	75000.00	0.00	0.00	13500.00	88500.00	confirmed	unpaid	regular	\N	2026-04-03 21:14:06.228723	2026-04-03 21:14:06.228723	\N	0.00
34	6	purchase	PUR-2024-006	2024-10-15	\N	Kerala Office Properties	32AABCK1234I1Z3	\N	32	99999.00	99999.00	0.00	0.00	17999.82	117998.82	confirmed	unpaid	regular	\N	2026-04-03 21:18:00.950139	2026-04-03 21:18:00.950139	\N	0.00
35	6	purchase	PUR-2024-007	2024-11-20	\N	National Equipment Suppliers	07AABCN8901J1Z5	\N	07	325000.00	325000.00	0.00	0.00	58500.00	383500.00	confirmed	unpaid	regular	\N	2026-04-03 21:20:40.058499	2026-04-03 21:20:40.058499	\N	0.00
30	6	sale	SAL-2024-002	2026-04-03	\N	Mumbai Infra Corp	27AABCM2345F1Z5	\N	27	230000.00	230000.00	0.00	0.00	41400.00	271400.00	cancelled	unpaid	regular	\N	2026-04-03 21:04:45.741998	2026-04-03 21:21:21.470872	\N	0.00
26	6	purchase	PUR-2024-001	2024-04-10	\N	Raw Materials Co	29AABCR1234A1Z5	\N	Kerala	154400.00	154400.00	0.00	0.00	27792.00	182192.00	confirmed	unpaid	regular	Auto-ingested from: FinLex_Test_Invoices.pdf	2026-04-03 20:29:17.997062	2026-04-03 20:29:17.997062	\N	0.00
27	6	sale	SAL-2024-001	2024-04-15	\N	TechBuild Solutions	32AABCT9012C1Z1	\N	32	197000.00	197000.00	0.00	0.00	35460.00	232460.00	confirmed	unpaid	regular	\N	2026-04-03 20:55:06.186006	2026-04-03 20:55:06.186006	\N	0.00
28	6	purchase	PUR-2024-002	2024-05-15	\N	Office Supplies Hub	27AABCO3456D1Z9	\N	27	42000.00	42000.00	0.00	0.00	6300.00	48300.00	confirmed	unpaid	regular	\N	2026-04-03 20:58:46.794073	2026-04-03 20:58:46.794073	\N	0.00
29	6	purchase	PUR-2024-003	2024-06-01	\N	Kerala IT Consultant	32AABCK7890E1Z7	\N	32	150000.00	150000.00	0.00	0.00	27000.00	177000.00	confirmed	unpaid	regular	\N	2026-04-03 21:02:43.478777	2026-04-03 21:02:43.478777	\N	0.00
38	6	purchase	\tTDS-TEST-001	2026-04-03	\N	Kerala Office Properties	32AABCK1234I1Z3	\N	32	100000.00	100000.00	0.00	0.00	18000.00	118000.00	confirmed	unpaid	regular	\N	2026-04-03 22:46:26.94926	2026-04-03 22:46:26.94926	\N	\N
39	6	purchase	TDS-TEST-001	2026-04-03	\N	Kerala Office Properties	32AABCK1234I1Z3	\N	32	100000.00	0.00	0.00	0.00	18000.00	118000.00	confirmed	unpaid	regular	\N	2026-04-03 22:49:56.304604	2026-04-03 22:49:56.304604	194I	10000.00
41	1	sale	SAL-2024-002	2024-06-20	\N	FinLex Demo Pvt Ltd	32AABCF5678B1Z3	\N	Maharashtra	380000.00	380000.00	0.00	0.00	68400.00	271400.00	confirmed	unpaid	regular	Auto-ingested from: FinLex_Test_Invoices.pdf [Page 2/4]	2026-04-04 10:19:01.585732	2026-04-04 10:19:01.585732	\N	0.00
42	1	purchase	PUR-2024-006	2024-10-15	\N	FinLex Demo Pvt Ltd	32AABCF5678B1Z3	\N	Kerala	84000.00	84000.00	0.00	0.00	14580.00	175000.00	confirmed	unpaid	regular	Auto-ingested from: FinLex_Test_Invoices.pdf [Page 4/4]	2026-04-04 10:19:01.633058	2026-04-04 10:19:01.633058	\N	0.00
52	7	purchase	AWS-IN-2024-11-08291	2024-11-01	\N	Amazon Web Services India Private Limited	27AAACA1234B1ZA	\N	29	33600.00	33600.00	3024.00	3024.00	0.00	39648.00	confirmed	unpaid	regular	Auto-ingested from: 01_AWS_Cloud_Services_Nov2024.pdf	2026-04-04 20:25:30.06627	2026-04-04 20:25:30.06627	\N	0.00
53	7	purchase	RK-INV-2024-047	2024-10-31	\N	Rajesh Kumar (Freelance Software Developer)	29AABPK5678G1ZQ	\N	29	68000.00	68000.00	6120.00	6120.00	0.00	80240.00	confirmed	unpaid	regular	Auto-ingested from: 02_Rajesh_Kumar_Dev_Oct2024.pdf	2026-04-04 20:25:39.60068	2026-04-04 20:25:39.60068	\N	0.00
54	7	purchase	PPM-RENT-NOV24-0089	2024-11-01	\N	Prestige Property Management LLP	29AABCP9012H1ZR	\N	29	63000.00	63000.00	5670.00	5670.00	0.00	74340.00	confirmed	unpaid	regular	Auto-ingested from: 03_Prestige_Office_Rent_Nov2024.pdf	2026-04-04 20:25:46.728495	2026-04-04 20:25:46.728495	\N	0.00
55	7	purchase	TNS-2024-10-0156	2024-10-15	\N	TechNova Solutions Private Limited	29AABCT1234F1ZP	\N	29	1645000.00	1645000.00	148050.00	148050.00	0.00	1941100.00	confirmed	unpaid	regular	Auto-ingested from: 04_TechNova_Sale_Growfast_Oct2024.pdf	2026-04-04 20:25:53.48838	2026-04-04 20:25:53.48838	\N	0.00
56	7	purchase	LE-2024-10-0312	2024-10-25	\N	LegalEdge Associates (Advocates & Solicitors)	29AABCL7890J1ZT	\N	29	55000.00	55000.00	4950.00	4950.00	0.00	64900.00	confirmed	unpaid	regular	Auto-ingested from: 05_LegalEdge_Legal_Services_Oct2024.pdf	2026-04-04 20:26:05.205663	2026-04-04 20:26:05.205663	\N	0.00
\.


--
-- Data for Name: journal_entries; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.journal_entries (id, company_id, entry_number, entry_date, reference_type, reference_id, narration, is_posted, created_by, created_at) FROM stdin;
1	1	JE-0001	2024-04-05	invoice	1	Sales Invoice INV-2024-001 — Tech Solutions Mumbai	t	1	2026-04-01 16:32:33.96141
2	1	JE-0002	2024-05-10	invoice	2	Sales Invoice INV-2024-002 — Pune Distributors Ltd	t	1	2026-04-01 16:32:33.96141
3	1	JE-0003	2024-06-15	invoice	3	Sales Invoice INV-2024-003 — Mumbai Retailers Co	t	1	2026-04-01 16:32:33.96141
4	1	JE-0004	2024-07-20	invoice	4	Sales Invoice INV-2024-004 — Kerala Imports Pvt Ltd	t	1	2026-04-01 16:32:33.96141
5	1	JE-0005	2024-08-25	invoice	5	Sales Invoice INV-2024-005 — Bangalore Tech Corp	t	1	2026-04-01 16:32:33.96141
6	1	JE-0006	2024-09-30	invoice	6	Sales Invoice INV-2024-006 — Delhi Enterprises	t	1	2026-04-01 16:32:33.96141
7	1	JE-0007	2024-10-05	invoice	7	Sales Invoice INV-2024-007 — Tech Solutions Mumbai	t	1	2026-04-01 16:32:33.96141
8	1	JE-0008	2024-11-10	invoice	8	Sales Invoice INV-2024-008 — Pune Distributors Ltd	t	1	2026-04-01 16:32:33.96141
9	1	JE-0009	2024-12-15	invoice	9	Sales Invoice INV-2024-009 — Gujarat Traders	t	1	2026-04-01 16:32:33.96141
10	1	JE-0010	2025-01-20	invoice	10	Sales Invoice INV-2025-001 — Mumbai Retailers Co	t	1	2026-04-01 16:32:33.96141
11	1	JE-0011	2024-04-10	invoice	11	Purchase Invoice PUR-2024-001 — Raw Materials Co	t	1	2026-04-01 16:32:33.96141
12	1	JE-0012	2024-05-15	invoice	12	Purchase Invoice PUR-2024-002 — Office Supplies Hub	t	1	2026-04-01 16:32:33.96141
13	1	JE-0013	2024-06-20	invoice	13	Purchase Invoice PUR-2024-003 — Chennai Suppliers	t	1	2026-04-01 16:32:33.96141
14	1	JE-0014	2024-09-10	invoice	14	Purchase Invoice PUR-2024-004 — Raw Materials Co	t	1	2026-04-01 16:32:33.96141
15	1	JE-0015	2024-12-05	invoice	15	Purchase Invoice PUR-2024-005 — Tech Equipment Delhi	t	1	2026-04-01 16:32:33.96141
16	1	JE-0016	2024-04-20	payment	1	Payment received — Tech Solutions Mumbai — INV-2024-001	t	1	2026-04-01 16:32:33.96141
17	1	JE-0017	2024-05-25	payment	2	Payment received — Pune Distributors — INV-2024-002	t	1	2026-04-01 16:32:33.96141
18	1	JE-0018	2024-04-15	payment	11	Payment made — Raw Materials Co — PUR-2024-001	t	1	2026-04-01 16:32:33.96141
19	1	JE-0019	2024-08-30	payment	5	Payment received — Bangalore Tech Corp — INV-2024-005	t	1	2026-04-01 16:32:33.96141
20	1	JE-0020	2024-11-20	payment	8	Payment received — Pune Distributors — INV-2024-008	t	1	2026-04-01 16:32:33.96141
21	1	JE-0021	2024-04-30	manual	\N	Salary payment for April 2024	t	1	2026-04-01 16:32:33.96141
22	1	JE-0022	2024-05-31	manual	\N	Salary payment for May 2024	t	1	2026-04-01 16:32:33.96141
23	1	JE-0023	2024-06-30	manual	\N	Rent payment for Q1 2024	t	1	2026-04-01 16:32:33.96141
24	1	JE-0024	2024-07-05	tds	\N	TDS on Professional Services — LegalEdge Associates — Section 194J	t	1	2026-04-01 16:32:33.96141
25	1	JE-0025	2024-10-10	tds	\N	TDS on Rent — Premises Owner — Section 194I	t	1	2026-04-01 16:32:33.96141
26	2	JE-0001	2024-04-12	invoice	16	Sales Invoice KST-2024-001 — Mumbai Spice Importers	t	1	2026-04-02 14:40:52.254979
27	2	JE-0002	2024-07-18	invoice	17	Sales Invoice KST-2024-002 — Bangalore Groceries	t	1	2026-04-02 14:40:52.254979
28	2	JE-0003	2024-11-22	invoice	18	Sales Invoice KST-2024-003 — Delhi Food Corp	t	1	2026-04-02 14:40:52.254979
29	2	JE-0004	2024-04-20	invoice	19	Purchase Invoice KPR-2024-001 — Spice Farm Kerala	t	1	2026-04-02 14:40:52.254979
30	2	JE-0005	2024-04-30	payment	16	Payment received — Mumbai Spice Importers — KST-2024-001	t	1	2026-04-02 14:40:52.254979
31	2	JE-0006	2024-08-05	payment	17	Payment received — Bangalore Groceries — KST-2024-002	t	1	2026-04-02 14:40:52.254979
32	2	JE-0007	2024-05-10	payment	19	Payment made — Spice Farm Kerala — KPR-2024-001	t	1	2026-04-02 14:40:52.254979
33	2	JE-0008	2024-04-30	manual	\N	Salary payment April 2024	t	1	2026-04-02 14:40:52.254979
34	2	JE-0009	2024-07-31	manual	\N	Salary payment July 2024	t	1	2026-04-02 14:40:52.254979
35	2	JE-0010	2026-04-01	invoice	20	Purchase Invoice GST-INV-1001 — Unknown Party [AI Ingested]	t	1	2026-04-03 12:54:17.716537
36	2	JE-0011	2026-04-03	reversal	20	REVERSAL: Purchase Invoice GST-INV-1001 — Unknown Party [Cancelled]	t	1	2026-04-03 16:01:50.452809
118	7	JE-0001	2024-11-01	invoice	52	Purchase Invoice AWS-IN-2024-11-08291 — Amazon Web Services India Private Limited [AI Ingested]	t	1	2026-04-04 20:25:30.06627
119	7	JE-0002	2024-10-31	invoice	53	Purchase Invoice RK-INV-2024-047 — Rajesh Kumar (Freelance Software Developer) [AI Ingested]	t	1	2026-04-04 20:25:39.60068
120	7	JE-0003	2024-10-31	tds	53	TDS @ 10% u/s 194J on Rajesh Kumar (Freelance Software Developer) [Auto-deducted]	t	1	2026-04-04 20:25:39.60068
121	7	JE-0004	2024-11-01	invoice	54	Purchase Invoice PPM-RENT-NOV24-0089 — Prestige Property Management LLP [AI Ingested]	t	1	2026-04-04 20:25:46.728495
122	7	JE-0005	2024-11-01	tds	54	TDS @ 10% u/s 194I on Prestige Property Management LLP [Auto-deducted]	t	1	2026-04-04 20:25:46.728495
123	7	JE-0006	2024-10-15	invoice	55	Purchase Invoice TNS-2024-10-0156 — TechNova Solutions Private Limited [AI Ingested]	t	1	2026-04-04 20:25:53.48838
124	7	JE-0007	2024-10-25	invoice	56	Purchase Invoice LE-2024-10-0312 — LegalEdge Associates (Advocates & Solicitors) [AI Ingested]	t	1	2026-04-04 20:26:05.205663
87	6	JE-0001	2024-04-10	invoice	26	Purchase Invoice PUR-2024-001 — Raw Materials Co [AI Ingested]	t	1	2026-04-03 20:29:17.997062
88	6	JE-0002	2024-04-15	invoice	27	Sales Invoice SAL-2024-001 — TechBuild Solutions	t	1	2026-04-03 20:55:06.186006
89	6	JE-0003	2024-05-15	invoice	28	Purchase Invoice PUR-2024-002 — Office Supplies Hub	t	1	2026-04-03 20:58:46.794073
90	6	JE-0004	2024-06-01	invoice	29	Purchase Invoice PUR-2024-003 — Kerala IT Consultant	t	1	2026-04-03 21:02:43.478777
91	6	JE-0005	2026-04-03	invoice	30	Sales Invoice SAL-2024-002 — Mumbai Infra Corp	t	1	2026-04-03 21:04:45.741998
92	6	JE-0006	2024-09-10	invoice	31	Purchase Invoice PUR-2024-004 — Spice Farm Kerala	t	1	2026-04-03 21:07:36.957471
93	6	JE-0007	2024-09-25	invoice	32	Purchase Invoice PUR-2024-005 — Multi Supply Traders	t	1	2026-04-03 21:11:34.334315
94	6	JE-0008	2024-10-05	invoice	33	Sales Invoice SAL-2024-003 — Walk-in Customer (B2C)	t	1	2026-04-03 21:14:06.228723
95	6	JE-0009	2024-10-15	invoice	34	Purchase Invoice PUR-2024-006 — Kerala Office Properties	t	1	2026-04-03 21:18:00.950139
96	6	JE-0010	2024-11-20	invoice	35	Purchase Invoice PUR-2024-007 — National Equipment Suppliers	t	1	2026-04-03 21:20:40.058499
97	6	JE-0011	2026-04-03	reversal	30	REVERSAL: Sales Invoice SAL-2024-002 — Mumbai Infra Corp [Cancelled]	t	1	2026-04-03 21:21:21.470872
98	6	JE-0012	2026-04-03	invoice	38	Purchase Invoice \tTDS-TEST-001 — Kerala Office Properties	t	1	2026-04-03 22:46:26.94926
99	1	JE-0026	2024-06-20	invoice	41	Sales Invoice SAL-2024-002 — FinLex Demo Pvt Ltd [AI Ingested]	t	1	2026-04-04 10:19:01.585732
100	1	JE-0027	2024-10-15	invoice	42	Purchase Invoice PUR-2024-006 — FinLex Demo Pvt Ltd [AI Ingested]	t	1	2026-04-04 10:19:01.633058
\.


--
-- Data for Name: journal_entry_lines; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.journal_entry_lines (id, journal_entry_id, account_id, debit_amount, credit_amount, narration) FROM stdin;
1	1	3	118000.00	0.00	Accounts Receivable
2	1	16	0.00	100000.00	Sales Revenue
3	1	10	0.00	9000.00	CGST Payable
4	1	11	0.00	9000.00	SGST Payable
5	2	3	59000.00	0.00	Accounts Receivable
6	2	16	0.00	50000.00	Sales Revenue
7	2	10	0.00	4500.00	CGST Payable
8	2	11	0.00	4500.00	SGST Payable
9	3	3	88500.00	0.00	Accounts Receivable
10	3	16	0.00	75000.00	Sales Revenue
11	3	10	0.00	6750.00	CGST Payable
12	3	11	0.00	6750.00	SGST Payable
13	4	3	236000.00	0.00	Accounts Receivable
14	4	16	0.00	200000.00	Sales Revenue
15	4	12	0.00	36000.00	IGST Payable
16	5	3	177000.00	0.00	Accounts Receivable
17	5	17	0.00	150000.00	Service Revenue
18	5	12	0.00	27000.00	IGST Payable
19	6	3	94400.00	0.00	Accounts Receivable
20	6	17	0.00	80000.00	Service Revenue
21	6	12	0.00	14400.00	IGST Payable
22	7	3	141600.00	0.00	Accounts Receivable
23	7	16	0.00	120000.00	Sales Revenue
24	7	10	0.00	10800.00	CGST Payable
25	7	11	0.00	10800.00	SGST Payable
26	8	3	106200.00	0.00	Accounts Receivable
27	8	16	0.00	90000.00	Sales Revenue
28	8	10	0.00	8100.00	CGST Payable
29	8	11	0.00	8100.00	SGST Payable
30	9	3	70800.00	0.00	Accounts Receivable
31	9	16	0.00	60000.00	Sales Revenue
32	9	12	0.00	10800.00	IGST Payable
33	10	3	129800.00	0.00	Accounts Receivable
34	10	16	0.00	110000.00	Sales Revenue
35	10	10	0.00	9900.00	CGST Payable
36	10	11	0.00	9900.00	SGST Payable
37	11	19	40000.00	0.00	Purchases
38	11	4	3600.00	0.00	Input GST CGST
39	11	5	3600.00	0.00	Input GST SGST
40	11	9	0.00	47200.00	Accounts Payable
41	12	19	15000.00	0.00	Purchases
42	12	4	1350.00	0.00	Input GST CGST
43	12	5	1350.00	0.00	Input GST SGST
44	12	9	0.00	17700.00	Accounts Payable
45	13	19	80000.00	0.00	Purchases
46	13	6	14400.00	0.00	Input GST IGST
47	13	9	0.00	94400.00	Accounts Payable
48	14	19	55000.00	0.00	Purchases
49	14	4	4950.00	0.00	Input GST CGST
50	14	5	4950.00	0.00	Input GST SGST
51	14	9	0.00	64900.00	Accounts Payable
52	15	19	120000.00	0.00	Purchases
53	15	6	21600.00	0.00	Input GST IGST
54	15	9	0.00	141600.00	Accounts Payable
55	16	2	118000.00	0.00	Payment received via bank
56	16	3	0.00	118000.00	INV-2024-001 cleared
57	17	2	59000.00	0.00	Payment received via bank
58	17	3	0.00	59000.00	INV-2024-002 cleared
59	18	9	47200.00	0.00	PUR-2024-001 cleared
60	18	2	0.00	47200.00	Payment via bank
61	19	2	177000.00	0.00	Payment received via bank
62	19	3	0.00	177000.00	INV-2024-005 cleared
63	20	2	106200.00	0.00	Payment received via bank
64	20	3	0.00	106200.00	INV-2024-008 cleared
65	21	20	80000.00	0.00	Salaries April 2024
66	21	2	0.00	80000.00	Bank payment
67	22	20	80000.00	0.00	Salaries May 2024
68	22	2	0.00	80000.00	Bank payment
69	23	21	90000.00	0.00	Rent Q1 2024
70	23	2	0.00	90000.00	Bank payment
71	24	22	50000.00	0.00	Professional Fees — LegalEdge
72	24	13	0.00	5000.00	TDS @ 10% u/s 194J
73	24	2	0.00	45000.00	Net payment to LegalEdge
74	25	21	30000.00	0.00	Rent — Oct 2024
75	25	13	0.00	3000.00	TDS @ 10% u/s 194I
76	25	2	0.00	27000.00	Net payment
77	26	27	53100.00	0.00	Accounts Receivable
78	26	37	0.00	45000.00	Sales Revenue
79	26	34	0.00	8100.00	IGST Payable
80	27	27	37760.00	0.00	Accounts Receivable
81	27	37	0.00	32000.00	Sales Revenue
82	27	34	0.00	5760.00	IGST Payable
83	28	27	79060.00	0.00	Accounts Receivable
84	28	37	0.00	67000.00	Sales Revenue
85	28	34	0.00	12060.00	IGST Payable
86	29	39	20000.00	0.00	Purchases
87	29	28	1800.00	0.00	Input GST CGST
88	29	29	1800.00	0.00	Input GST SGST
89	29	31	0.00	23600.00	Accounts Payable
90	30	26	53100.00	0.00	Payment received via bank
91	30	27	0.00	53100.00	KST-2024-001 cleared
92	31	26	37760.00	0.00	Payment received via bank
93	31	27	0.00	37760.00	KST-2024-002 cleared
94	32	31	23600.00	0.00	KPR-2024-001 cleared
95	32	26	0.00	23600.00	Payment via bank
96	33	40	35000.00	0.00	Salaries April 2024
97	33	26	0.00	35000.00	Bank payment
98	34	40	35000.00	0.00	Salaries July 2024
99	34	26	0.00	35000.00	Bank payment
100	35	39	4200.00	0.00	Purchases
103	35	31	0.00	5712.00	Accounts Payable
101	35	28	756.00	0.00	GST Input CGST
102	35	29	756.00	0.00	GST Input SGST
104	36	39	0.00	4200.00	Reversal: Purchases
105	36	31	5712.00	0.00	Reversal: Accounts Payable
106	36	28	0.00	756.00	Reversal: GST Input CGST
107	36	29	0.00	756.00	Reversal: GST Input SGST
228	87	123	154400.00	0.00	Purchases
229	87	95	27792.00	0.00	GST Input IGST
230	87	104	0.00	182192.00	Accounts Payable
231	88	92	232460.00	0.00	Accounts Receivable
232	88	117	0.00	197000.00	Sales Revenue
233	88	107	0.00	35460.00	IGST Payable
234	89	123	42000.00	0.00	Purchases
235	89	95	6300.00	0.00	GST Input IGST
236	89	104	0.00	48300.00	Accounts Payable
237	90	123	150000.00	0.00	Purchases
238	90	95	27000.00	0.00	GST Input IGST
239	90	104	0.00	177000.00	Accounts Payable
240	91	92	271400.00	0.00	Accounts Receivable
241	91	117	0.00	230000.00	Sales Revenue
242	91	107	0.00	41400.00	IGST Payable
243	92	123	45000.00	0.00	Purchases
244	92	95	2250.00	0.00	GST Input IGST
245	92	104	0.00	47250.00	Accounts Payable
246	93	123	15500.00	0.00	Purchases
247	93	95	2250.00	0.00	GST Input IGST
248	93	104	0.00	17750.00	Accounts Payable
249	94	92	88500.00	0.00	Accounts Receivable
250	94	117	0.00	75000.00	Sales Revenue
251	94	107	0.00	13500.00	IGST Payable
252	95	123	99999.00	0.00	Purchases
253	95	95	17999.82	0.00	GST Input IGST
254	95	104	0.00	117998.82	Accounts Payable
255	96	123	325000.00	0.00	Purchases
256	96	95	58500.00	0.00	GST Input IGST
257	96	104	0.00	383500.00	Accounts Payable
258	97	92	0.00	271400.00	Reversal: Accounts Receivable
259	97	117	230000.00	0.00	Reversal: Sales Revenue
260	97	107	41400.00	0.00	Reversal: IGST Payable
261	98	123	100000.00	0.00	Purchases
262	98	95	18000.00	0.00	GST Input IGST
263	98	104	0.00	118000.00	Accounts Payable
264	99	3	271400.00	0.00	Accounts Receivable
265	99	16	0.00	380000.00	Sales Revenue
266	99	12	0.00	68400.00	IGST Payable
267	100	19	84000.00	0.00	Purchases
268	100	6	14580.00	0.00	GST Input IGST
269	100	9	0.00	175000.00	Accounts Payable
320	118	171	33600.00	0.00	Purchases
321	118	141	3024.00	0.00	GST Input CGST
322	118	142	3024.00	0.00	GST Input SGST
323	118	152	0.00	39648.00	Accounts Payable
324	119	171	68000.00	0.00	Purchases
325	119	141	6120.00	0.00	GST Input CGST
326	119	142	6120.00	0.00	GST Input SGST
327	119	152	0.00	80240.00	Accounts Payable
328	120	152	6800.00	0.00	TDS deducted from payable — Rajesh Kumar (Freelance Software Developer)
329	120	156	0.00	6800.00	TDS Payable u/s 194J — to deposit with Govt
330	121	171	63000.00	0.00	Purchases
331	121	141	5670.00	0.00	GST Input CGST
332	121	142	5670.00	0.00	GST Input SGST
333	121	152	0.00	74340.00	Accounts Payable
334	122	152	6300.00	0.00	TDS deducted from payable — Prestige Property Management LLP
335	122	156	0.00	6300.00	TDS Payable u/s 194I — to deposit with Govt
336	123	171	1645000.00	0.00	Purchases
337	123	141	148050.00	0.00	GST Input CGST
338	123	142	148050.00	0.00	GST Input SGST
339	123	152	0.00	1941100.00	Accounts Payable
340	124	171	55000.00	0.00	Purchases
341	124	141	4950.00	0.00	GST Input CGST
342	124	142	4950.00	0.00	GST Input SGST
343	124	152	0.00	64900.00	Accounts Payable
\.


--
-- Data for Name: opening_balance_imports; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.opening_balance_imports (id, company_id, import_date, financial_year, total_debit, total_credit, is_balanced, imported_by, created_at, as_of_date) FROM stdin;
\.


--
-- Data for Name: parties; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.parties (id, company_id, name, type, gstin, pan, state_code, state_name, address, email, phone, is_active, created_at) FROM stdin;
\.


--
-- Data for Name: payroll_entries; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payroll_entries (id, company_id, employee_name, employee_pan, month, year, gross_salary, basic, hra, allowances, pf_employee, pf_employer, esic_employee, esic_employer, tds_amount, other_deductions, net_salary, payment_date, payment_mode, journal_entry_id, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: tds_entries; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tds_entries (id, company_id, party_name, party_pan, section, gross_amount, tds_rate, tds_amount, net_amount, payment_date, payment_nature, challan_no, created_by, created_at, deposited, deposit_date) FROM stdin;
1	1	LegalEdge Associates	AABCL1234A	194J	50000.00	10.00	5000.00	45000.00	2024-07-05	Professional Fees	CHL-001	1	2026-04-01 16:32:34.082292	f	\N
2	1	Property Owner Mr Shah	AABCS5678B	194I	30000.00	10.00	3000.00	27000.00	2024-10-10	Rent	CHL-002	1	2026-04-01 16:32:34.082292	f	\N
3	1	IT Contractor Pvt Ltd	AABCI9012C	194C	80000.00	2.00	1600.00	78400.00	2024-08-15	Contract Services	CHL-003	1	2026-04-01 16:32:34.082292	f	\N
4	1	Digital Agency	AABCD3456D	194J	40000.00	10.00	4000.00	36000.00	2024-11-20	Technical Services	CHL-004	1	2026-04-01 16:32:34.082292	f	\N
8	7	Rajesh Kumar (Freelance Software Developer)	\N	194J	68000.00	10.00	6800.00	61200.00	2024-10-31	Technical Services	\N	1	2026-04-04 20:25:39.60068	f	\N
9	7	Prestige Property Management LLP	\N	194I	63000.00	10.00	6300.00	56700.00	2024-11-01	Rent	\N	1	2026-04-04 20:25:46.728495	f	\N
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, name, email, password_hash, role, created_at, updated_at) FROM stdin;
2	Fida Ahmed CA	fida2@example.com	$2a$12$5MOev1r.osh5Nviku99tM.HLklzmxBU4L7pvynso.oo30sEAUEnCC	ca	2026-04-01 16:39:06.200343	2026-04-01 16:39:06.200343
1	Fida Ahmed CA	fida@example.com	$2a$12$7mpsFBHJ3yrbOpz596xwTusleGpErRBc6Zn4RoI1GhMWqCbMw2.8e	ca	2026-04-01 16:32:33.872696	2026-04-01 16:32:33.872696
\.


--
-- Name: account_groups_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.account_groups_id_seq', 45, true);


--
-- Name: accounts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.accounts_id_seq', 189, true);


--
-- Name: audit_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.audit_log_id_seq', 36, true);


--
-- Name: bank_statements_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.bank_statements_id_seq', 1, false);


--
-- Name: ca_company_access_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.ca_company_access_id_seq', 7, true);


--
-- Name: companies_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.companies_id_seq', 7, true);


--
-- Name: compliance_deadlines_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.compliance_deadlines_id_seq', 88, true);


--
-- Name: credit_debit_note_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.credit_debit_note_items_id_seq', 1, false);


--
-- Name: credit_debit_notes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.credit_debit_notes_id_seq', 1, false);


--
-- Name: depreciation_entries_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.depreciation_entries_id_seq', 1, false);


--
-- Name: fixed_assets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.fixed_assets_id_seq', 1, false);


--
-- Name: invoice_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.invoice_items_id_seq', 96, true);


--
-- Name: invoices_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.invoices_id_seq', 56, true);


--
-- Name: journal_entries_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.journal_entries_id_seq', 125, true);


--
-- Name: journal_entry_lines_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.journal_entry_lines_id_seq', 344, true);


--
-- Name: opening_balance_imports_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.opening_balance_imports_id_seq', 1, false);


--
-- Name: payroll_entries_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.payroll_entries_id_seq', 1, false);


--
-- Name: tds_entries_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.tds_entries_id_seq', 9, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 2, true);


--
-- Name: account_groups account_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_groups
    ADD CONSTRAINT account_groups_pkey PRIMARY KEY (id);


--
-- Name: accounts accounts_company_id_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_company_id_code_key UNIQUE (company_id, code);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: bank_statements bank_statements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bank_statements
    ADD CONSTRAINT bank_statements_pkey PRIMARY KEY (id);


--
-- Name: ca_company_access ca_company_access_ca_id_company_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ca_company_access
    ADD CONSTRAINT ca_company_access_ca_id_company_id_key UNIQUE (ca_id, company_id);


--
-- Name: ca_company_access ca_company_access_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ca_company_access
    ADD CONSTRAINT ca_company_access_pkey PRIMARY KEY (id);


--
-- Name: client_tasks client_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_tasks
    ADD CONSTRAINT client_tasks_pkey PRIMARY KEY (id);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: compliance_deadlines compliance_deadlines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compliance_deadlines
    ADD CONSTRAINT compliance_deadlines_pkey PRIMARY KEY (id);


--
-- Name: credit_debit_note_items credit_debit_note_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.credit_debit_note_items
    ADD CONSTRAINT credit_debit_note_items_pkey PRIMARY KEY (id);


--
-- Name: credit_debit_notes credit_debit_notes_company_id_note_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.credit_debit_notes
    ADD CONSTRAINT credit_debit_notes_company_id_note_number_key UNIQUE (company_id, note_number);


--
-- Name: credit_debit_notes credit_debit_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.credit_debit_notes
    ADD CONSTRAINT credit_debit_notes_pkey PRIMARY KEY (id);


--
-- Name: depreciation_entries depreciation_entries_asset_id_financial_year_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.depreciation_entries
    ADD CONSTRAINT depreciation_entries_asset_id_financial_year_key UNIQUE (asset_id, financial_year);


--
-- Name: depreciation_entries depreciation_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.depreciation_entries
    ADD CONSTRAINT depreciation_entries_pkey PRIMARY KEY (id);


--
-- Name: document_requests document_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.document_requests
    ADD CONSTRAINT document_requests_pkey PRIMARY KEY (id);


--
-- Name: financial_statement_config financial_statement_config_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.financial_statement_config
    ADD CONSTRAINT financial_statement_config_pkey PRIMARY KEY (id);


--
-- Name: fixed_assets fixed_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fixed_assets
    ADD CONSTRAINT fixed_assets_pkey PRIMARY KEY (id);


--
-- Name: gst_rates gst_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gst_rates
    ADD CONSTRAINT gst_rates_pkey PRIMARY KEY (id);


--
-- Name: gst_returns gst_returns_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gst_returns
    ADD CONSTRAINT gst_returns_pkey PRIMARY KEY (id);


--
-- Name: invoice_items invoice_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_company_id_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_company_id_invoice_number_key UNIQUE (company_id, invoice_number);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: journal_entries journal_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_pkey PRIMARY KEY (id);


--
-- Name: journal_entry_lines journal_entry_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journal_entry_lines
    ADD CONSTRAINT journal_entry_lines_pkey PRIMARY KEY (id);


--
-- Name: opening_balance_imports opening_balance_imports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opening_balance_imports
    ADD CONSTRAINT opening_balance_imports_pkey PRIMARY KEY (id);


--
-- Name: parties parties_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.parties
    ADD CONSTRAINT parties_pkey PRIMARY KEY (id);


--
-- Name: payroll_entries payroll_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payroll_entries
    ADD CONSTRAINT payroll_entries_pkey PRIMARY KEY (id);


--
-- Name: tds_entries tds_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tds_entries
    ADD CONSTRAINT tds_entries_pkey PRIMARY KEY (id);


--
-- Name: account_groups uq_account_groups_company_name; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_groups
    ADD CONSTRAINT uq_account_groups_company_name UNIQUE (company_id, name);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_accounts_company; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_accounts_company ON public.accounts USING btree (company_id);


--
-- Name: idx_audit_company; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_company ON public.audit_log USING btree (company_id);


--
-- Name: idx_bank_stmt_account; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bank_stmt_account ON public.bank_statements USING btree (account_id);


--
-- Name: idx_bank_stmt_company; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bank_stmt_company ON public.bank_statements USING btree (company_id);


--
-- Name: idx_ca_access_ca; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ca_access_ca ON public.ca_company_access USING btree (ca_id);


--
-- Name: idx_ca_access_company; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ca_access_company ON public.ca_company_access USING btree (company_id);


--
-- Name: idx_cdn_company; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cdn_company ON public.credit_debit_notes USING btree (company_id);


--
-- Name: idx_companies_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_companies_created_by ON public.companies USING btree (created_by);


--
-- Name: idx_compliance_company; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_compliance_company ON public.compliance_deadlines USING btree (company_id);


--
-- Name: idx_depreciation_company; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_depreciation_company ON public.depreciation_entries USING btree (company_id);


--
-- Name: idx_fixed_assets_company; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fixed_assets_company ON public.fixed_assets USING btree (company_id);


--
-- Name: idx_invoice_items_invoice; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_invoice_items_invoice ON public.invoice_items USING btree (invoice_id);


--
-- Name: idx_invoices_company; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_invoices_company ON public.invoices USING btree (company_id);


--
-- Name: idx_invoices_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_invoices_type ON public.invoices USING btree (invoice_type);


--
-- Name: idx_journal_company; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_journal_company ON public.journal_entries USING btree (company_id);


--
-- Name: idx_journal_lines_entry; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_journal_lines_entry ON public.journal_entry_lines USING btree (journal_entry_id);


--
-- Name: idx_payroll_company; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payroll_company ON public.payroll_entries USING btree (company_id);


--
-- Name: idx_tds_company; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tds_company ON public.tds_entries USING btree (company_id);


--
-- Name: companies trg_companies_updated; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_companies_updated BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- Name: journal_entry_lines trg_enforce_double_entry; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE CONSTRAINT TRIGGER trg_enforce_double_entry AFTER INSERT OR UPDATE ON public.journal_entry_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.enforce_double_entry();


--
-- Name: invoices trg_invoices_updated; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- Name: accounts trg_sync_opening_balance; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_sync_opening_balance BEFORE INSERT OR UPDATE OF opening_debit, opening_credit ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.sync_opening_balance();


--
-- Name: account_groups account_groups_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_groups
    ADD CONSTRAINT account_groups_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: accounts accounts_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: accounts accounts_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.account_groups(id);


--
-- Name: accounts accounts_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.accounts(id);


--
-- Name: audit_log audit_log_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: audit_log audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: bank_statements bank_statements_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bank_statements
    ADD CONSTRAINT bank_statements_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: bank_statements bank_statements_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bank_statements
    ADD CONSTRAINT bank_statements_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: bank_statements bank_statements_matched_je_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bank_statements
    ADD CONSTRAINT bank_statements_matched_je_id_fkey FOREIGN KEY (matched_je_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;


--
-- Name: ca_company_access ca_company_access_ca_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ca_company_access
    ADD CONSTRAINT ca_company_access_ca_id_fkey FOREIGN KEY (ca_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: ca_company_access ca_company_access_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ca_company_access
    ADD CONSTRAINT ca_company_access_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: companies companies_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: compliance_deadlines compliance_deadlines_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compliance_deadlines
    ADD CONSTRAINT compliance_deadlines_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: credit_debit_note_items credit_debit_note_items_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.credit_debit_note_items
    ADD CONSTRAINT credit_debit_note_items_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.credit_debit_notes(id) ON DELETE CASCADE;


--
-- Name: credit_debit_notes credit_debit_notes_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.credit_debit_notes
    ADD CONSTRAINT credit_debit_notes_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: credit_debit_notes credit_debit_notes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.credit_debit_notes
    ADD CONSTRAINT credit_debit_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: credit_debit_notes credit_debit_notes_original_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.credit_debit_notes
    ADD CONSTRAINT credit_debit_notes_original_invoice_id_fkey FOREIGN KEY (original_invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;


--
-- Name: depreciation_entries depreciation_entries_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.depreciation_entries
    ADD CONSTRAINT depreciation_entries_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.fixed_assets(id) ON DELETE CASCADE;


--
-- Name: depreciation_entries depreciation_entries_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.depreciation_entries
    ADD CONSTRAINT depreciation_entries_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: depreciation_entries depreciation_entries_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.depreciation_entries
    ADD CONSTRAINT depreciation_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: depreciation_entries depreciation_entries_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.depreciation_entries
    ADD CONSTRAINT depreciation_entries_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;


--
-- Name: fixed_assets fixed_assets_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fixed_assets
    ADD CONSTRAINT fixed_assets_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: fixed_assets fixed_assets_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fixed_assets
    ADD CONSTRAINT fixed_assets_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: fixed_assets fixed_assets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fixed_assets
    ADD CONSTRAINT fixed_assets_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: invoice_items invoice_items_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: invoice_items invoice_items_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: journal_entries journal_entries_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: journal_entries journal_entries_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: journal_entry_lines journal_entry_lines_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journal_entry_lines
    ADD CONSTRAINT journal_entry_lines_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: journal_entry_lines journal_entry_lines_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journal_entry_lines
    ADD CONSTRAINT journal_entry_lines_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE CASCADE;


--
-- Name: opening_balance_imports opening_balance_imports_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opening_balance_imports
    ADD CONSTRAINT opening_balance_imports_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: opening_balance_imports opening_balance_imports_imported_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opening_balance_imports
    ADD CONSTRAINT opening_balance_imports_imported_by_fkey FOREIGN KEY (imported_by) REFERENCES public.users(id);


--
-- Name: parties parties_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.parties
    ADD CONSTRAINT parties_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: payroll_entries payroll_entries_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payroll_entries
    ADD CONSTRAINT payroll_entries_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: payroll_entries payroll_entries_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payroll_entries
    ADD CONSTRAINT payroll_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: payroll_entries payroll_entries_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payroll_entries
    ADD CONSTRAINT payroll_entries_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;


--
-- Name: tds_entries tds_entries_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tds_entries
    ADD CONSTRAINT tds_entries_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: tds_entries tds_entries_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tds_entries
    ADD CONSTRAINT tds_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--

\unrestrict Nt8XUEJbFndfOJbMj8hIgRB97UFilN8wKqaar1Q1PT6M173fkUGq7kgqyYxBWCo

