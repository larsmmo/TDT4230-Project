#version 430 core

in GS_OUT {
	vec3 normal;
	vec2 textureCoordinates;
	vec3 fragPos;
} fs_in;

struct PointLight {    
    vec3 position;
    vec3 color;
};

#define MAX_LIGHTS 10

uniform PointLight pointLights[MAX_LIGHTS];

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
	vec3 norm = normalize(fs_in.normal);						

	vec3 viewDir = normalize(cameraPosition - fs_in.fragPos);

	vec3 ambient;
	vec3 diffuse;
	vec3 specular;

	for (int i = 0; i < numLights; i++){
		vec3 lightDir = normalize(pointLights[i].position - fs_in.fragPos);									// Is it better to declare the variables outside of loop to avoid construction and destruction? (better performance?)
		vec3 reflectDir = reflect(-lightDir, norm);

		float lightDistance = length(pointLights[i].position - fs_in.fragPos);
		float lightAttenuation = 1.0 / (constant + linear * lightDistance + quadratic * (lightDistance * lightDistance));

		float diff = max(dot(norm,lightDir), 0.0) * lightAttenuation;
		float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32) * lightAttenuation;

		ambient += ambientStrength * pointLights[i].color * lightAttenuation;
		diffuse += diff * pointLights[i].color;
		specular += specularStrength * spec * pointLights[i].color;
	}

	float dither = dither(fs_in.textureCoordinates);

	vec3 combined = (ambient + diffuse + specular) * vec3(0.99, 0.99, 0.99) + dither;					// last vector = object color
	color = vec4(combined, 1.0);
}