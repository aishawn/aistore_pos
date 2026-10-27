package com.orithos.modules.ai;

import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.mock.env.MockEnvironment;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DashScopeModelRoutingTest {

    @Test
    void routesQwen38FlashToMultimodal() {
        assertTrue(DashScopeModelRouting.requiresMultimodalEndpoint("qwen3.8-flash"));
        assertEquals(
                DashScopeModelRouting.MULTIMODAL_COMPLETIONS_PATH,
                DashScopeModelRouting.completionsPathForModel("qwen3.8-flash"));
    }

    @Test
    void keepsClassicChatModelsOnTextGeneration() {
        assertFalse(DashScopeModelRouting.requiresMultimodalEndpoint("qwen-plus"));
        assertFalse(DashScopeModelRouting.requiresMultimodalEndpoint("qwen-flash"));
        assertEquals(
                DashScopeModelRouting.TEXT_COMPLETIONS_PATH,
                DashScopeModelRouting.completionsPathForModel("qwen-plus"));
    }

    @Test
    void environmentPostProcessorSetsMultiModelForQwen38() {
        MockEnvironment env = new MockEnvironment();
        env.setProperty("AI_DASHSCOPE_MODEL", "qwen3.8-flash");
        new DashScopeEnvironmentPostProcessor().postProcessEnvironment(env, new SpringApplication());
        assertEquals(Boolean.TRUE, env.getProperty(DashScopeEnvironmentPostProcessor.MULTI_MODEL_PROPERTY, Boolean.class));
        assertEquals(
                DashScopeModelRouting.TEXT_COMPLETIONS_PATH,
                env.getProperty(DashScopeEnvironmentPostProcessor.COMPLETIONS_PATH_PROPERTY));
    }

    @Test
    void incompatibleFalseOverrideCannotDisableQwen38Routing() {
        MockEnvironment env = new MockEnvironment();
        env.setProperty("AI_DASHSCOPE_MODEL", "qwen3.8-flash");
        env.setProperty("AI_DASHSCOPE_MULTI_MODEL", "false");
        new DashScopeEnvironmentPostProcessor().postProcessEnvironment(env, new SpringApplication());
        assertEquals(Boolean.TRUE, env.getProperty(DashScopeEnvironmentPostProcessor.MULTI_MODEL_PROPERTY, Boolean.class));
    }

    @Test
    void environmentPostProcessorKeepsTextPathForQwenPlus() {
        MockEnvironment env = new MockEnvironment();
        env.setProperty("AI_DASHSCOPE_MODEL", "qwen-plus");
        new DashScopeEnvironmentPostProcessor().postProcessEnvironment(env, new SpringApplication());
        assertEquals(Boolean.FALSE, env.getProperty(DashScopeEnvironmentPostProcessor.MULTI_MODEL_PROPERTY, Boolean.class));
        assertEquals(
                DashScopeModelRouting.TEXT_COMPLETIONS_PATH,
                env.getProperty(DashScopeEnvironmentPostProcessor.COMPLETIONS_PATH_PROPERTY));
    }

    @Test
    void explicitMultiModelOverrideWins() {
        MockEnvironment env = new MockEnvironment();
        env.setProperty("AI_DASHSCOPE_MODEL", "qwen-plus");
        env.setProperty("AI_DASHSCOPE_MULTI_MODEL", "true");
        new DashScopeEnvironmentPostProcessor().postProcessEnvironment(env, new SpringApplication());
        assertEquals(Boolean.TRUE, env.getProperty(DashScopeEnvironmentPostProcessor.MULTI_MODEL_PROPERTY, Boolean.class));
    }
}
