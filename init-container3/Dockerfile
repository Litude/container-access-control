#tomras/iptables-runner
FROM ubuntu:jammy

RUN apt-get update && \
    apt-get install --no-install-recommends -y iptables && \
    update-alternatives --set iptables /usr/sbin/iptables-legacy

#ENTRYPOINT iptables-legacy-restore < iptables-dump.txt
