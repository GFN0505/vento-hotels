# Database backups to Cloudflare R2: hourly dumps kept 48 hours, daily dumps kept 35 days, and a
# restore test on the 1st of each month that loads the newest daily dump into a scratch database.
FROM postgres:18.7-alpine
RUN apk add --no-cache rclone tzdata \
  && mkdir -p /root/.config/rclone && touch /root/.config/rclone/rclone.conf
COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh
ENTRYPOINT ["/usr/local/bin/backup.sh"]
CMD ["schedule"]
