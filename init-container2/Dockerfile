#tomras/iptables-simple-init
FROM ubuntu:jammy

WORKDIR /var/lib/init-container

COPY iptables-dump.txt .

RUN apt-get update && \
    apt-get install --no-install-recommends -y \
    iptables

ENTRYPOINT iptables-legacy-restore < iptables-dump.txt
