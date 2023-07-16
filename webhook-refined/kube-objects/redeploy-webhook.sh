#!/bin/bash

kubectl delete -f webhook-configuration-mutating.yaml

cd ..
cd src
docker build . -t tomras/validating-webhook-refined
docker push tomras/validating-webhook-refined
cd ..

cd kube-objects
kubectl -n webhook-test rollout restart deploy validating-webhook 
kubectl apply -f webhook-configuration-mutating.yaml
