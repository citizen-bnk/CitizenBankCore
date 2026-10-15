ALTER TABLE hub_memberships DROP CONSTRAINT hub_memberships_role_check;
ALTER TABLE hub_memberships ADD CONSTRAINT hub_memberships_role_check CHECK(role IN('customer','investor','shareholder','board_member','staff','back_office','admin','super_admin','candidate'));
