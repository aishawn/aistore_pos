package com.orithos.config;

import org.springframework.boot.CommandLineRunner;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.DatabasePopulatorUtils;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.util.Collection;
import java.util.List;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 30)
public class CompetitorPriceSchemaMigrator implements CommandLineRunner {
    private final DataSource dataSource;

    public CompetitorPriceSchemaMigrator(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(String... args) {
        Collection<? extends DataSource> targets = migrationTargets(dataSource);
        for (DataSource target : targets) {
            apply(target);
        }
    }

    static Collection<? extends DataSource> migrationTargets(DataSource dataSource) {
        return dataSource instanceof ShardRoutingDataSource routed
                ? routed.businessShardDataSources().values()
                : List.of(dataSource);
    }

    private void apply(DataSource target) {
        ResourceDatabasePopulator populator = new ResourceDatabasePopulator();
        populator.setContinueOnError(false);
        populator.setSeparator(";");
        populator.addScript(new ClassPathResource("db/migration_competitor_price_observations.sql"));
        DatabasePopulatorUtils.execute(populator, target);
    }
}
