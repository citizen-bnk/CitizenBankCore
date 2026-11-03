CREATE UNIQUE INDEX hub_certificate_register_version_once ON hub_documents(scope,record_id,record_version) WHERE category='certificate' AND state='issued';
