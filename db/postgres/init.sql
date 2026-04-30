DROP TABLE IF EXISTS user_questions;

DROP TABLE IF EXISTS events_fallback;

DROP TABLE IF EXISTS aggregations;

DROP TABLE IF EXISTS aggregation_configs;

DROP TABLE IF EXISTS cron_jobs;

DROP TABLE IF EXISTS events;

DROP TABLE IF EXISTS sessions;

DROP TABLE IF EXISTS users;

DROP TABLE IF EXISTS admins;

CREATE TABLE
    IF NOT EXISTS users (
        id UUID PRIMARY KEY,
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

CREATE TABLE
    IF NOT EXISTS sessions (
        id UUID PRIMARY KEY,
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

CREATE TABLE
    IF NOT EXISTS events (
        event_id UUID PRIMARY KEY,
        event_name VARCHAR NOT NULL,
        user_id UUID REFERENCES users (id),
        distinct_id VARCHAR NOT NULL,
        session_id UUID REFERENCES sessions (id),
        client_timestamp TIMESTAMPTZ NOT NULL,
        server_timestamp TIMESTAMPTZ NOT NULL,
        page VARCHAR,
        html_element VARCHAR,
        intent VARCHAR DEFAULT 'unconfirmed',
        sdk_version VARCHAR,
        device_properties JSONB,
        properties JSONB
    );