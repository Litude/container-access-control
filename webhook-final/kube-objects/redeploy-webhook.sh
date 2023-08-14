#!/bin/bash

kubectl delete -f webhook-configuration-mutating.yaml

cd ..
cd src
docker build . -t tomras/iptables-lo-webhook
docker push tomras/iptables-lo-webhook
cd ..

cd kube-objects
kubectl -n iptables-lo-system rollout restart deploy iptables-lo-deployment 
kubectl apply -f webhook-configuration-mutating.yaml
