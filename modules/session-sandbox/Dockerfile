FROM node@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0
USER root
RUN mkdir -p /workspace && chown 1000:1000 /workspace
WORKDIR /workspace
USER 1000:1000
CMD ["sleep", "infinity"]
