#!/bin/sh
# One-time setup of a fresh Contabo server (Ubuntu 24.04), run as root:
#   curl -fsSL https://raw.githubusercontent.com/GFN0505/vento-hotels/main/deploy/bootstrap.sh -o bootstrap.sh
#   less bootstrap.sh            # read it first
#   sh bootstrap.sh "ssh-ed25519 AAAA... github-actions-deploy"
# It installs Docker, creates a `deploy` user that GitHub Actions signs in as (with the key given),
# turns on the firewall (SSH, HTTP, HTTPS only), automatic security updates and fail2ban, and
# prepares /opt/vento. Password sign-in over SSH is turned off only after the key is in place.
set -eu

DEPLOY_KEY="${1:?Give the deploy public key as the first argument}"

apt-get update
apt-get install -y ca-certificates curl ufw fail2ban unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades

if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

id deploy >/dev/null 2>&1 || adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
echo "$DEPLOY_KEY" > /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

install -d -m 750 -o deploy -g deploy /opt/vento

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

# Keys only from now on. Your own key must already be in /root/.ssh/authorized_keys (Contabo asks
# for one when you order the server); otherwise skip this by commenting it out.
if [ -s /root/.ssh/authorized_keys ]; then
  printf 'PasswordAuthentication no\nPermitRootLogin prohibit-password\n' > /etc/ssh/sshd_config.d/90-vento.conf
  systemctl reload ssh || systemctl reload sshd
else
  echo "Note: /root/.ssh/authorized_keys is empty, so password sign-in is left on. Add your key and rerun."
fi

systemctl enable --now fail2ban
echo "Done. Next: put .env in /opt/vento (see deploy/.env.server.example) and run the Deploy workflow."
