-- Core tables
CREATE TABLE
    IF NOT EXISTS sites (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        domain VARCHAR NOT NULL UNIQUE,
        name VARCHAR,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW ()
    );

CREATE TABLE
    IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        site_id UUID NOT NULL REFERENCES sites (id),
        distinct_id_list JSONB DEFAULT '[]',
        fingerprint VARCHAR,
        is_identified BOOLEAN DEFAULT false,
        external_user_id VARCHAR,
        consent_given BOOLEAN DEFAULT false,
        consent_given_at TIMESTAMPTZ,
        data_deletion_requested BOOLEAN DEFAULT false,
        data_deletion_requested_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW (),
        updated_at TIMESTAMPTZ DEFAULT NOW (),
        properties JSONB
    );

CREATE INDEX ON users (site_id);

CREATE TABLE
    IF NOT EXISTS sessions (
        id UUID PRIMARY KEY,
        site_id UUID NOT NULL REFERENCES sites (id),
        user_id UUID REFERENCES users (id),
        distinct_id VARCHAR NOT NULL,
        started_at TIMESTAMPTZ NOT NULL,
        ended_at TIMESTAMPTZ,
        duration_ms INTEGER,
        entry_page VARCHAR,
        exit_page VARCHAR,
        event_count INTEGER DEFAULT 0,
        device_properties JSONB,
        properties JSONB
    );

CREATE INDEX ON sessions (site_id, started_at DESC);

CREATE TABLE
    IF NOT EXISTS events (
        event_id UUID PRIMARY KEY,
        site_id UUID NOT NULL REFERENCES sites (id),
        event_name VARCHAR NOT NULL,
        user_id UUID REFERENCES users (id),
        distinct_id VARCHAR NOT NULL,
        session_id UUID,
        client_timestamp TIMESTAMPTZ NOT NULL,
        server_timestamp TIMESTAMPTZ NOT NULL,
        page VARCHAR,
        html_element VARCHAR,
        intent VARCHAR DEFAULT 'unconfirmed',
        sdk_version VARCHAR,
        device_properties JSONB,
        properties JSONB
    );

CREATE INDEX ON events (site_id, client_timestamp DESC);

CREATE INDEX ON events (site_id, event_name, client_timestamp DESC);

CREATE INDEX ON events (session_id);

-- Aggregation tables
CREATE TABLE
    agg_pageviews_hourly (
        id BIGSERIAL PRIMARY KEY,
        site_id UUID NOT NULL REFERENCES sites (id),
        bucket_hour TIMESTAMPTZ NOT NULL,
        count BIGINT NOT NULL DEFAULT 0,
        UNIQUE (site_id, bucket_hour)
    );

CREATE INDEX ON agg_pageviews_hourly (site_id, bucket_hour DESC);

CREATE TABLE
    agg_events_hourly (
        id BIGSERIAL PRIMARY KEY,
        site_id UUID NOT NULL REFERENCES sites (id),
        event_name VARCHAR(128) NOT NULL,
        bucket_hour TIMESTAMPTZ NOT NULL,
        count BIGINT NOT NULL DEFAULT 0,
        UNIQUE (site_id, event_name, bucket_hour)
    );

CREATE INDEX ON agg_events_hourly (site_id, event_name, bucket_hour DESC);

CREATE TABLE
    agg_sessions_hourly (
        id BIGSERIAL PRIMARY KEY,
        site_id UUID NOT NULL REFERENCES sites (id),
        bucket_hour TIMESTAMPTZ NOT NULL,
        count BIGINT NOT NULL DEFAULT 0,
        UNIQUE (site_id, bucket_hour)
    );

CREATE INDEX ON agg_sessions_hourly (site_id, bucket_hour DESC);

CREATE TABLE
    agg_unique_users_daily (
        id BIGSERIAL PRIMARY KEY,
        site_id UUID NOT NULL REFERENCES sites (id),
        bucket_date DATE NOT NULL,
        approx_count INT NOT NULL DEFAULT 0,
        hll_blob BYTEA,
        UNIQUE (site_id, bucket_date)
    );

CREATE INDEX ON agg_unique_users_daily (site_id, bucket_date DESC);

CREATE TABLE
    agg_session_duration_daily (
        id BIGSERIAL PRIMARY KEY,
        site_id UUID NOT NULL REFERENCES sites (id),
        bucket_date DATE NOT NULL,
        duration_sum BIGINT NOT NULL DEFAULT 0,
        session_count BIGINT NOT NULL DEFAULT 0,
        UNIQUE (site_id, bucket_date)
    );

CREATE INDEX ON agg_session_duration_daily (site_id, bucket_date DESC);