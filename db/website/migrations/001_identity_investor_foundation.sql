-- Website compatibility tables reconstructed from the website's SQL and models.
-- Demo bootstrap only. No legacy customer records are imported.
CREATE TABLE user_profiles (
 user_id text PRIMARY KEY, email text NOT NULL UNIQUE, full_name text NOT NULL,
 phone text, id_number text, account_type text DEFAULT 'personal', status text DEFAULT 'active',
 profile_completed boolean NOT NULL DEFAULT false,
 profile_completion_percentage integer NOT NULL DEFAULT 0 CHECK (profile_completion_percentage BETWEEN 0 AND 100),
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 street_address text, city text, state_province text, postal_code text, country text,
 date_of_birth date, gender text, nationality text, citizenship_status text,
 occupation text, employer text, linkedin_profile text, source_of_funds text,
 investor_type text, investment_purpose text, business_name text, company_registration_number text,
 tax_id text, email_verified boolean DEFAULT false, mobile_verified boolean DEFAULT false,
 phone_verified boolean DEFAULT false, identity_type text, id_country_of_issue text,
 selfie_picture_url text, half_body_picture_url text, cv_document_url text, cv_filename text,
 cv_uploaded_at timestamptz, cv_share_link text, bio text
);
CREATE TABLE roles (id serial PRIMARY KEY, role_name text UNIQUE NOT NULL, description text, created_at timestamptz DEFAULT now());
CREATE TABLE user_roles (
 id serial PRIMARY KEY, user_id text NOT NULL REFERENCES user_profiles(user_id),
 role_id integer NOT NULL REFERENCES roles(id), assigned_by text, assigned_at timestamptz DEFAULT now(),
 UNIQUE(user_id,role_id)
);
CREATE INDEX user_roles_role_idx ON user_roles(role_id);
CREATE TABLE board_members (
 id serial PRIMARY KEY, user_id text UNIQUE REFERENCES user_profiles(user_id), email text NOT NULL,
 full_name text NOT NULL, position text, status text DEFAULT 'active', appointed_date date,
 term_end_date date, term_years integer, total_shares integer DEFAULT 0, appointed_by text,
 created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), version integer DEFAULT 1,
 phone text, bio text, profile_picture_url text, cv_document_url text
);
CREATE TABLE share_classes (
 id serial PRIMARY KEY, class_name text NOT NULL UNIQUE, display_name text NOT NULL,
 description text, price_per_share numeric(18,2) NOT NULL CHECK(price_per_share>0),
 currency text NOT NULL DEFAULT 'LSL', min_shares integer NOT NULL CHECK(min_shares>0),
 max_shares integer NOT NULL, shares_on_offer integer NOT NULL DEFAULT 0,
 shares_issued integer NOT NULL DEFAULT 0, available_shares integer NOT NULL DEFAULT 0,
 is_default boolean DEFAULT false, is_active boolean DEFAULT true,
 created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
 CHECK(max_shares>=min_shares), CHECK(shares_issued>=0 AND shares_on_offer>=shares_issued)
);
CREATE TABLE share_config (
 id serial PRIMARY KEY, price_per_share numeric(18,2) NOT NULL, min_subscription integer NOT NULL,
 max_subscription integer NOT NULL, total_authorized integer NOT NULL, total_issued integer NOT NULL DEFAULT 0,
 offered_for_public integer NOT NULL, available_shares integer NOT NULL,
 is_active boolean DEFAULT true, updated_at timestamptz DEFAULT now(), updated_by text
);
CREATE TABLE share_subscriptions (
 id serial PRIMARY KEY, subscription_id text NOT NULL UNIQUE,
 user_id text REFERENCES user_profiles(user_id), full_name text NOT NULL, email text NOT NULL,
 phone text, id_number text, num_shares integer NOT NULL CHECK(num_shares>0), share_class text,
 total_amount numeric(18,2) NOT NULL CHECK(total_amount>=0), amount_paid numeric(18,2) NOT NULL DEFAULT 0 CHECK(amount_paid>=0),
 payment_method text, payment_status text, status text, subscriber_type text,
 created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), version integer DEFAULT 1,
 street_address text, city text, state_province text, postal_code text, country text,
 date_of_birth date, nationality text, gender text, citizenship_status text,
 occupation text, employer text, source_of_funds text, investor_type text, investment_purpose text,
 business_name text, company_registration_number text, tax_id text, currency text DEFAULT 'LSL',
 notes text, certificate_url text, certificate_number text, referred_by text,
 CHECK(amount_paid<=total_amount)
);
CREATE INDEX share_subscriptions_user_idx ON share_subscriptions(user_id);
CREATE TABLE subscription_payments (
 id serial PRIMARY KEY, subscription_id integer NOT NULL REFERENCES share_subscriptions(id),
 payment_reference text NOT NULL, amount numeric(18,2) NOT NULL CHECK(amount>0),
 payment_method text, payment_date timestamp, status text DEFAULT 'pending',
 verified_by text, verified_at timestamptz, proof_of_payment_url text, receipt_url text,
 notes text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
 UNIQUE(subscription_id,payment_reference)
);
CREATE TABLE user_suspensions (
 id serial PRIMARY KEY, user_id text NOT NULL REFERENCES user_profiles(user_id), reason text NOT NULL,
 suspended_by text, suspended_at timestamptz DEFAULT now(), is_active boolean DEFAULT true,
 lifted_by text, lifted_at timestamptz
);
CREATE INDEX user_suspensions_active_idx ON user_suspensions(user_id) WHERE is_active;
CREATE TABLE transactional_outbox (
 id bigserial PRIMARY KEY, aggregate_type text NOT NULL, aggregate_id text NOT NULL,
 event_type text NOT NULL, payload jsonb NOT NULL, status text NOT NULL DEFAULT 'pending',
 processing_attempts integer NOT NULL DEFAULT 0, error_message text,
 created_at timestamptz DEFAULT now(), processed_at timestamptz, completed_at timestamptz,
 next_retry_at timestamptz
);
CREATE INDEX transactional_outbox_pending_idx ON transactional_outbox(status,created_at);
INSERT INTO roles(role_name,description) VALUES
 ('customer','Demo banking user'), ('investor','Demo investor'), ('shareholder','Demo shareholder'),
 ('board_member','Demo board member'), ('staff','Demo staff'), ('back_office','Demo back office'),
 ('admin','Demo administrator'), ('super_admin','Demo platform administrator');
-- Fictional pricing and capacity. These are not an offer to invest.
INSERT INTO share_classes(class_name,display_name,description,price_per_share,min_shares,max_shares,shares_on_offer,available_shares,is_default)
 VALUES('Class A','Class A (demo)','Fictional demo shares',10,100,100000,1000000,1000000,true);
INSERT INTO share_config(price_per_share,min_subscription,max_subscription,total_authorized,offered_for_public,available_shares)
 VALUES(10,100,100000,1000000,1000000,1000000);
