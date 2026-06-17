# Design Spec: OpenTelemetry Demo — EC2 Hackathon Deployment

**Status:** Ready for implementation  
**Target repo:** Existing Terraform repo (apply using established conventions)  
**Audience:** Terraform agent responsible for provisioning

This spec describes *what* must exist and *why*. Implementation details — module
structure, variable naming, file layout, state backend — should follow the conventions
already established in the Terraform repo. A reference User Data script is provided
in the appendix as a guide, not a prescription.

---

## 1. Context

The [OpenTelemetry Demo](https://github.com/scottys-eftsure/opentelemetry-demo) ("Astronomy
Shop") is a microservices e-commerce application that demonstrates OpenTelemetry
instrumentation across 10 languages. It runs as 29 Docker containers orchestrated by
Docker Compose, started via `make start` from the repo root.

The application is maintained in a fork of the upstream
[open-telemetry/opentelemetry-demo](https://github.com/open-telemetry/opentelemetry-demo)
repository at `https://github.com/scottys-eftsure/opentelemetry-demo`. The fork is the
canonical source for this deployment — the upstream repo must not be used, as the fork
may contain local configuration changes (e.g. `compose.extras.yaml`, OTel Collector
config) that are required for the Grafana Cloud integration to function correctly.

The goal is to host this on a single EC2 instance in our existing AWS account for a
one-off internal team hackathon. This is not a production deployment. There are no
requirements for high availability, auto-scaling, or disaster recovery.

The demo stack ships with a full observability backend (Jaeger, Grafana, Prometheus,
OpenSearch) and is also configured to forward telemetry to a Grafana Cloud instance
via credentials stored in `.env.override`. All access is via an internal corporate VPN.

---

## 2. Requirements

### 2.1 Compute

- A single EC2 instance must be provisioned.
- It must run the full default Docker Compose stack (`make start`) without modification
  to the application source code or compose files.
- The instance must have enough CPU and RAM to run 29 containers comfortably. The stack
  has a configured memory ceiling of ~8 GB across all containers. The five largest
  consumers are: `load-generator` (1.5 GB), `jaeger` (1.2 GB), `opensearch` (1 GB),
  `kafka` (620 MB), `recommendation` (500 MB).
- The instance must use the latest current-generation x86 general-purpose AMI
  (Amazon Linux 2023, x86_64). ARM/Graviton was excluded to avoid image compatibility
  risk during a live demo.

**Specified instance type:** `m8i.2xlarge` (8 vCPU, 32 GB RAM, Intel Xeon 6)  
**Specified AMI family:** Amazon Linux 2023 x86_64 (use `most_recent = true`)  
**Specified key pair:** `aws-dev` (existing key pair in the account)

### 2.2 Storage

- A single EBS root volume, 50 GB, gp3 type.
- Justification: Docker image layers for the full stack total 8–12 GB compressed.
  OS and Docker daemon overhead adds ~3–5 GB. 50 GB gp3 provides safe headroom.
  gp3 is preferred over gp2 (better baseline performance, same or lower cost).

### 2.3 Networking

- The instance must be placed in an **existing private subnet**. It must not have a
  public IP address. All access is via the corporate VPN.
- The VPC already has a NAT gateway providing outbound internet access. This is required
  for pulling Docker images from `ghcr.io` and forwarding telemetry to Grafana Cloud.
- A security group must be created with the following inbound rules:

  | Port | Protocol | Source CIDR | Purpose |
  |------|----------|-------------|---------|
  | 22 | TCP | `172.31.0.0/16` | SSH access for setup and debugging |
  | 80 | TCP | `172.31.0.0/16` | HTTP (host-level redirect to 8080, see §2.5) |
  | 8080 | TCP | `172.31.0.0/16` | Envoy reverse proxy direct access |

- All outbound traffic must be permitted.
- `172.31.0.0/16` is the VPC CIDR, which covers both VPN-connected users and internal
  AWS traffic.

### 2.4 DNS

- An A record must be created in the existing **private** Route 53 hosted zone
  `in.eftsure.com`.
- Record name: `grafana-hackathon` (FQDN: `grafana-hackathon.in.eftsure.com`)
- Record value: the instance's private IP address
- TTL: 300
- Justification: A stable DNS name is required so that (a) teammates on the VPN have
  a predictable URL, (b) the Grafana Faro CORS origin can be configured ahead of time,
  and (c) `PUBLIC_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` (the browser-side OTel trace
  export URL) can be set to a static value in the SSM parameter rather than being
  detected at runtime.

### 2.5 Port Forwarding (Host-Level)

- The Docker stack's Envoy reverse proxy binds to port 8080 on the host. The stack
  must not be modified to use port 80, as doing so requires capability changes
  (`NET_BIND_SERVICE`) and edits to 6+ files across the repo, which would need a PR
  to the upstream project.
- Instead, the instance must be configured at the OS level to redirect inbound TCP
  port 80 to port 8080.
- On Amazon Linux 2023, this must be done using `firewalld` (not raw `iptables`),
  since AL2023 uses `nftables` as the backend. Direct `iptables` rules may not persist
  or interact correctly with Docker's own rules.
- The `firewalld` rule must persist across reboots.
- Relevant `firewalld` commands:
  ```bash
  firewall-cmd --permanent --add-port=8080/tcp
  firewall-cmd --permanent --add-forward-port=port=80:proto=tcp:toport=8080
  firewall-cmd --reload
  ```

### 2.6 Secrets and Configuration

- The file `.env.override` contains sensitive Grafana Cloud credentials. It must never
  be stored in git or pass through Terraform state.
- The SSM parameter resource must be managed by Terraform (so it is created and
  destroyed with the stack), but the parameter value must not be managed by Terraform.
- The pattern to achieve this is to create the `aws_ssm_parameter` resource with a
  placeholder value and a `lifecycle { ignore_changes = [value] }` block. Terraform
  owns the resource lifecycle but never reads or writes the actual secret value:
  ```hcl
  resource "aws_ssm_parameter" "env_override" {
    name  = "/opentelemetry-demo/env-override"
    type  = "SecureString"
    value = "placeholder"

    lifecycle {
      ignore_changes = [value]
    }
  }
  ```
- After the first `terraform apply`, the actual `.env.override` content must be
  written to the parameter manually. See §4.
- The parameter value is the full contents of the `.env.override` file. It must include
  the following entry in addition to the existing Grafana Cloud credentials:
  ```bash
  # Required for browser-side OTel traces to route correctly when teammates
  # access the demo from their own machines. The load generator is unaffected
  # (it injects synthetic_request=true baggage, which routes traces to the
  # internal OTel Collector directly, bypassing this variable entirely).
  PUBLIC_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://grafana-hackathon.in.eftsure.com/otlp-http/v1/traces
  ```
- On first boot, the instance must fetch this parameter and write it to
  `/opt/opentelemetry-demo/.env.override` with permissions `600`.
- **Important:** the instance User Data runs on first boot. The SSM parameter value
  must be populated before the instance is launched, or before it is rebooted for the
  first time after the value is set. The correct apply order is:
  1. `terraform apply` — creates the SSM parameter (placeholder value) and all other resources
  2. Populate the SSM parameter value manually (see §4)
  3. Start or reboot the instance so User Data (or the systemd service) fetches the real value

### 2.7 IAM

- The instance must have an IAM instance profile attached at launch.
- The IAM role must have the following minimum permissions:
  - `ssm:GetParameter` on the specific SSM parameter ARN:
    `arn:aws:ssm:<region>:<account-id>:parameter/opentelemetry-demo/env-override`
  - `kms:Decrypt` on the AWS-managed SSM key:
    `arn:aws:kms:<region>:<account-id>:alias/aws/ssm`

### 2.8 Bootstrap Behaviour

The instance must perform the following steps on **first boot**, via EC2 User Data:

1. Install system dependencies: `git`, `make`, Docker CE (from the official Docker
   repository — AL2023 does not include Docker in its default repos).
2. Clone the repository:
   `git clone https://github.com/scottys-eftsure/opentelemetry-demo.git /opt/opentelemetry-demo`
3. Fetch `/opentelemetry-demo/env-override` from SSM Parameter Store and write it
   to `/opt/opentelemetry-demo/.env.override` (permissions: `600`).
4. Configure `firewalld` to redirect port 80 → 8080 (see §2.5).
5. Install and enable a systemd service that runs `make start` (see §2.9).
6. Start the stack for the first time. Note: this will pull 8–12 GB of Docker images
   from `ghcr.io`. Allow 10–15 minutes on first boot.

### 2.9 Auto-Start Behaviour

- A systemd service must be installed that starts the demo stack on every boot.
- The service must start after `docker.service` and `network-online.target`.
- The service must restart automatically on failure with a 30-second delay between
  attempts. This covers transient errors without creating a tight retry loop.
- The service must use `TimeoutStartSec=infinity`. The first boot requires a large
  image pull that can take 10–15 minutes; systemd must not kill the service during
  this time.
- `ExecStart` must run `make start` from the repo directory
  (`/opt/opentelemetry-demo`).
- `ExecStop` must run `make stop` from the repo directory.
- On subsequent boots (after the first), images are cached on the EBS volume and the
  stack should be available within 1–2 minutes.

---

## 3. Acceptance Criteria

After provisioning, the following URLs must be reachable from a machine connected
to the corporate VPN:

| URL | Expected |
|-----|----------|
| `http://grafana-hackathon.in.eftsure.com` | Astronomy Shop storefront |
| `http://grafana-hackathon.in.eftsure.com/grafana/` | Grafana dashboards |
| `http://grafana-hackathon.in.eftsure.com/jaeger/ui/` | Jaeger trace explorer |
| `http://grafana-hackathon.in.eftsure.com/loadgen/` | Locust load generator UI |
| `http://grafana-hackathon.in.eftsure.com/feature` | flagd feature flag UI |

Allow 10–15 minutes after first boot for Docker image pulls to complete before
checking these URLs.

---

## 4. Pre-Deployment Manual Steps

These steps cannot be automated via Terraform and must be performed by a human operator.

### 4.1 Populate SSM Parameter Value (after `terraform apply`)

After `terraform apply` creates the SSM parameter with a placeholder value, populate
it with the real `.env.override` contents. The file must include the
`PUBLIC_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` entry documented in §2.6.

```bash
aws ssm put-parameter \
  --name "/opentelemetry-demo/env-override" \
  --type "SecureString" \
  --value "$(cat /path/to/.env.override)" \
  --overwrite
```

This must be done **before the instance is started or rebooted**, as the User Data
script fetches the parameter on first boot. If the instance has already booted with
the placeholder value, SSH in and re-run the fetch manually:

```bash
aws ssm get-parameter \
  --name "/opentelemetry-demo/env-override" \
  --with-decryption \
  --query "Parameter.Value" \
  --output text \
  > /opt/opentelemetry-demo/.env.override
chmod 600 /opt/opentelemetry-demo/.env.override
cd /opt/opentelemetry-demo && make stop && make start
```

### 4.2 Update Grafana Cloud Faro CORS

In the Grafana Cloud UI, navigate to Frontend Observability → your app → Settings
and update the CORS allowed origin to:

```
http://grafana-hackathon.in.eftsure.com
```

---

## 5. Out of Scope

The following are explicitly out of scope for this deployment:

- HTTPS / TLS termination (HTTP only, internal VPN access)
- Load balancing or auto-scaling
- Backup or snapshot policies
- Monitoring of the EC2 instance itself (the demo provides its own observability)
- Any modification to the application source code or Docker Compose files
- Building Docker images from source (pre-built images from `ghcr.io` are used)

---

## Appendix: Reference User Data Script

The following script is a reference implementation of the bootstrap behaviour
described in §2.8 and §2.9. Adapt it to match the conventions of the Terraform
repo (e.g. `templatefile()`, cloud-init `write_files`, separate bootstrap modules).

```bash
#!/bin/bash
set -euo pipefail
exec > >(tee /var/log/otel-demo-userdata.log | logger -t otel-demo-userdata) 2>&1

echo "=== OpenTelemetry Demo — EC2 Bootstrap ==="

# ---------------------------------------------------------------------------
# 1. System updates and dependencies
# ---------------------------------------------------------------------------
dnf update -y
dnf install -y git make

# Docker CE is not in AL2023 default repos — install from official Docker repo
dnf install -y dnf-plugins-core
dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable --now docker

# ---------------------------------------------------------------------------
# 2. Clone the repository
# ---------------------------------------------------------------------------
REPO_DIR="/opt/opentelemetry-demo"
git clone https://github.com/scottys-eftsure/opentelemetry-demo.git "$REPO_DIR"

# ---------------------------------------------------------------------------
# 3. Fetch .env.override from SSM Parameter Store
# ---------------------------------------------------------------------------
REGION=$(curl -s http://169.254.169.254/latest/meta-data/placement/region)

aws ssm get-parameter \
  --name "/opentelemetry-demo/env-override" \
  --with-decryption \
  --query "Parameter.Value" \
  --output text \
  --region "$REGION" \
  > "$REPO_DIR/.env.override"

chmod 600 "$REPO_DIR/.env.override"

# ---------------------------------------------------------------------------
# 4. Configure firewalld — redirect port 80 to 8080
# ---------------------------------------------------------------------------
# Envoy binds to 8080. Changing it to 80 inside the stack requires privilege
# changes and upstream repo edits. A firewalld redirect is cleaner and keeps
# the stack unmodified. firewalld persists rules across reboots on AL2023.
systemctl enable --now firewalld
firewall-cmd --permanent --add-port=8080/tcp
firewall-cmd --permanent --add-forward-port=port=80:proto=tcp:toport=8080
firewall-cmd --reload

# ---------------------------------------------------------------------------
# 5. Install systemd service
# ---------------------------------------------------------------------------
# TimeoutStartSec=infinity: first boot pulls 8-12 GB of images (10-15 min).
# RestartSec=30s: prevents tight retry loops on transient failures.
cat > /etc/systemd/system/otel-demo.service << 'EOF'
[Unit]
Description=OpenTelemetry Demo Stack
Documentation=https://opentelemetry.io/docs/demo/
After=docker.service network-online.target
Requires=docker.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/opentelemetry-demo
ExecStart=/usr/bin/make start
ExecStop=/usr/bin/make stop
Restart=on-failure
RestartSec=30s
TimeoutStartSec=infinity
TimeoutStopSec=120s
StandardOutput=journal
StandardError=journal
SyslogIdentifier=otel-demo

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable otel-demo.service

# ---------------------------------------------------------------------------
# 6. Start the stack (first boot)
# ---------------------------------------------------------------------------
cd "$REPO_DIR"
make start

echo "=== Bootstrap complete. Demo: http://grafana-hackathon.in.eftsure.com ==="
```
