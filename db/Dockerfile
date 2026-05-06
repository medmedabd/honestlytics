FROM postgres:16
COPY postgres/01_init.sql /docker-entrypoint-initdb.d/01_init.sql
COPY postgres/02_seed.sql /docker-entrypoint-initdb.d/02_seed.sql