#pragma once

#include <utilities/window.hpp>
#include <vector>
#include "sceneGraph.hpp"

void updateNodeTransformations(SceneNode* node, glm::mat4 transformationThusFar, glm::mat4 viewProjection);
void initGame(GLFWwindow* window, CommandLineOptions options);
void updateFrame(GLFWwindow* window);
void renderFrame(GLFWwindow* window);

std::vector<glm::mat4> lightSpaceTransform(glm::mat4 projection, LightSource light);