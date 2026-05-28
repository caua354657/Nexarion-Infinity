FROM php:8.2-apache

# PDO MySQL extension
RUN docker-php-ext-install pdo pdo_mysql

# Enable mod_rewrite and mod_headers
RUN a2enmod rewrite headers

# Allow .htaccess overrides in webroot
RUN printf '\n<Directory /var/www/html>\n    AllowOverride All\n    Options -Indexes\n</Directory>\n' \
    >> /etc/apache2/apache2.conf

# Copy all project files into webroot
COPY . /var/www/html/

# Move startup script out of webroot and remove dev files
RUN mv /var/www/html/docker-start.sh /docker-start.sh \
    && chmod +x /docker-start.sh \
    && rm -f /var/www/html/Dockerfile /var/www/html/.dockerignore /var/www/html/CLAUDE.md

# Ensure foto/ exists and is writable by Apache
RUN mkdir -p /var/www/html/foto \
    && chown -R www-data:www-data /var/www/html \
    && find /var/www/html -type d -exec chmod 755 {} \; \
    && find /var/www/html -type f -exec chmod 644 {} \; \
    && chmod 775 /var/www/html/foto

CMD ["/docker-start.sh"]
