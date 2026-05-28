#!/bin/bash
# Railway injects $PORT dynamically. Apache must listen on that port.
PORT=${PORT:-80}

sed -i "s/Listen 80/Listen $PORT/g" /etc/apache2/ports.conf
sed -i "s/<VirtualHost \*:80>/<VirtualHost *:$PORT>/g" /etc/apache2/sites-available/000-default.conf

exec apache2-foreground
