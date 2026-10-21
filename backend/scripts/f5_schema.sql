-- F5 social observations and affiliate link visits.
-- Legacy table retirement is handled separately by retire_legacy_tracking.sql.


CREATE TABLE IF NOT EXISTS tracking_observations (
	observation_id UUID NOT NULL, 
	user_id UUID NOT NULL, 
	account_id UUID NOT NULL, 
	distribution_id UUID, 
	platform VARCHAR NOT NULL, 
	external_ref VARCHAR NOT NULL, 
	observed_date DATE NOT NULL, 
	observed_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	published_date DATE, 
	views INTEGER, 
	likes INTEGER, 
	comments INTEGER, 
	shares INTEGER, 
	engagement INTEGER, 
	PRIMARY KEY (observation_id), 
	UNIQUE (user_id, account_id, external_ref, observed_date), 
	FOREIGN KEY(user_id) REFERENCES users (user_id) ON DELETE CASCADE, 
	FOREIGN KEY(account_id) REFERENCES social_accounts (account_id) ON DELETE CASCADE, 
	FOREIGN KEY(distribution_id) REFERENCES distributions (distribution_id) ON DELETE CASCADE
)

;

CREATE INDEX IF NOT EXISTS ix_tracking_observations_user_id ON tracking_observations (user_id);


CREATE TABLE IF NOT EXISTS tracking_links (
	link_id UUID NOT NULL, 
	user_id UUID NOT NULL, 
	distribution_id UUID NOT NULL, 
	code VARCHAR(64) NOT NULL, 
	destination TEXT NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (link_id), 
	FOREIGN KEY(user_id) REFERENCES users (user_id) ON DELETE CASCADE, 
	UNIQUE (distribution_id), 
	FOREIGN KEY(distribution_id) REFERENCES distributions (distribution_id) ON DELETE CASCADE, 
	UNIQUE (code)
)

;

CREATE INDEX IF NOT EXISTS ix_tracking_links_user_id ON tracking_links (user_id);


CREATE TABLE IF NOT EXISTS tracking_clicks (
	click_id UUID NOT NULL, 
	link_id UUID NOT NULL, 
	clicked_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (click_id), 
	FOREIGN KEY(link_id) REFERENCES tracking_links (link_id) ON DELETE CASCADE
)

;

CREATE INDEX IF NOT EXISTS ix_tracking_clicks_link_id ON tracking_clicks (link_id);

CREATE INDEX IF NOT EXISTS ix_tracking_clicks_clicked_at ON tracking_clicks (clicked_at);