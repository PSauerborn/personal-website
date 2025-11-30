# create A record to point domain to VM IP
resource "aws_route53_record" "a_record" {
  for_each = toset(var.dns_config.subdomains)
  zone_id  = data.aws_route53_zone.main.zone_id
  name     = each.value
  type     = "A"
  ttl      = 300
  records  = [var.dns_config.forward_ip]
}
