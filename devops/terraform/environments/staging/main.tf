module "networking" {
  source = "../../modules/networking"

  environment = var.environment
  vpc_cidr    = var.vpc_cidr
  region      = var.aws_region
}

module "kubernetes" {
  source = "../../modules/kubernetes"

  environment     = var.environment
  cluster_name    = "${var.project_name}-${var.environment}"
  cluster_version = "1.29"
  vpc_id          = module.networking.vpc_id
  subnet_ids      = module.networking.private_subnet_ids
  instance_types  = ["t3.small"]

  depends_on = [module.networking]
}
