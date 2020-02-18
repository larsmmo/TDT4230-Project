#version 430 core

struct PointLight {    
    vec3 position;
    vec3 color;
};

#define MAX_LIGHTS 10

uniform PointLight pointLights[MAX_LIGHTS];

in layout(location = 0) vec3 normal;
in layout(location = 1) vec2 textureCoordinates;
in layout(location = 2) vec3 fragPos;

uniform layout(location = 6) int numLights;

uniform layout(location = 10) vec3 cameraPosition;

out vec4 color;

float rand(vec2 co) { return fract(sin(dot(co.xy, vec2(12.9898,78.233))) * 43758.5453); }
float dither(vec2 uv) { return (rand(uv)*2.0-1.0) / 256.0; }

float ambientStrength = 0.04;
float specularStrength = 1.0;

float constant = 1.0;
float linear = 0.028;
float quadratic = 0.0020;

void main()
{
	vec3 norm = normalize(normal);						

	vec3 viewDir = normalize(cameraPosition - fragPos);

	vec3 ambient;
	vec3 diffuse;
	vec3 specular;

	for (int i = 0; i < numLights; i++){
		vec3 lightDir = normalize(pointLights[i].position - fragPos);									// Is it better to declare the variables outside of loop to avoid construction and destruction? (better performance?)
		vec3 reflectDir = reflect(-lightDir, norm);

		float lightDistance = length(pointLights[i].position - fragPos);
		float lightAttenuation = 1.0 / (constant + linear * lightDistance + quadratic * (lightDistance * lightDistance));

		float diff = max(dot(norm,lightDir), 0.0) * lightAttenuation;
		float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32) * lightAttenuation;

		ambient += ambientStrength * pointLights[i].color * lightAttenuation;
		diffuse += diff * pointLights[i].color;
		specular += specularStrength * spec * pointLights[i].color;
	}

	float dither = dither(textureCoordinates);

	vec3 combined = (ambient + diffuse + specular) * vec3(0.99, 0.99, 0.99) + dither;					// last vector = object color
	color = vec4(combined, 1.0);
}