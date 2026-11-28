-- New rate plans quote all-in prices unless the plan says otherwise (decision 0032). Existing plans keep
-- their setting.
ALTER TABLE "rate_plans" ALTER COLUMN "prices_include_taxes" SET DEFAULT true;